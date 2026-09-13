import type { Root } from "@glion/ast";
import { MllpCodecError } from "@glion/mllp-codec";

import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_RECONNECT_ATTEMPTS,
  DEFAULT_SEND_TIMEOUT_MS,
} from "../constants";
import {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpClientError,
  MllpConnectionError,
  MllpInvalidMessageError,
  MllpInvalidResponseError,
} from "../errors";
import type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpSendOptions,
  MllpSocket,
} from "../types";
import {
  assertByteCap,
  assertReconnectAttempts,
  assertTimeoutMs,
} from "./assertions";
import { MllpClientEmitter } from "./events";
import { decode, encode } from "./messages";
import { defaultReconnectDelay, sleep } from "./reconnect";
import type { ReconnectPolicy } from "./reconnect";
import { createSession } from "./session";
import type { ConnectOptions, MllpSession } from "./session";
import type { State } from "./state";

/**
 * Sends HL7v2 messages to one remote system over MLLP and returns each
 * message's acknowledgment.
 *
 * One client owns one socket and sends one message at a time. `send()` writes
 * the message, waits for the acknowledgment, checks that it answers this
 * message, and resolves with it.
 *
 * ```ts
 * import { MllpClient } from "@glion/mllp-client";
 * import { nodeSocket } from "@glion/mllp-client/node";
 *
 * await using client = new MllpClient({
 *   socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
 * });
 *
 * const ack = await client.send(adtMessage);
 * ack.code; // "AA" or "CA"
 * ```
 *
 * ## Lifecycle
 *
 * `send()` connects on first use; `connect()` opens the connection ahead of
 * time. `state` reports the phase. A connection that fails to open is dialed
 * again under the `reconnect` policy. A connection that is lost closes the
 * client: the message in flight rejects and is not sent again. After
 * `close()`, or once the client has closed on a failure, every call rejects
 * with {@link MllpClientClosedError}.
 *
 * ## Errors
 *
 * When the remote system answers `AE`, `AR`, `CE`, or `CR`, `send()` rejects
 * with the matching `@glion/ack` exception and the connection stays open.
 */
export class MllpClient extends MllpClientEmitter {
  readonly #socket: MllpSocket;
  readonly #connect: ConnectOptions;
  readonly #policy: ReconnectPolicy;
  readonly #sendTimeoutMs: number;
  #state: State = { phase: "idle" };

  /**
   * @throws {MllpInvalidOptionError} A timeout, byte cap, or attempt count is
   *   out of range.
   */
  constructor(opts: MllpClientOptions) {
    super();
    const connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const maxBufferedBytes =
      opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
    const attempts =
      opts.reconnect === false
        ? 0
        : (opts.reconnect?.attempts ?? DEFAULT_RECONNECT_ATTEMPTS);
    const delay =
      opts.reconnect === false
        ? defaultReconnectDelay
        : (opts.reconnect?.delay ?? defaultReconnectDelay);
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;

    assertTimeoutMs("connectTimeoutMs", connectTimeoutMs);
    assertTimeoutMs("sendTimeoutMs", this.#sendTimeoutMs);
    assertByteCap(maxBufferedBytes);
    assertReconnectAttempts(attempts);

    this.#socket = opts.socket;
    this.#connect = { maxBufferedBytes, timeoutMs: connectTimeoutMs };
    this.#policy = { attempts, delay };
  }

  /**
   * The current phase: `idle`, `connecting`, `connected`, `sending`,
   * `closing`, or `closed`.
   */
  get state(): MllpClientState {
    return this.#state.phase;
  }

  /** Whether the connection is open. True in both `connected` and `sending`. */
  get connected(): boolean {
    const { phase } = this.#state;
    return phase === "connected" || phase === "sending";
  }

  /**
   * Opens the connection ahead of the first `send()`, dialing again under the
   * `reconnect` policy when an attempt fails.
   *
   * Idempotent: a connected client resolves at once, and a call arriving while
   * an attempt is in flight waits for that attempt and shares its outcome.
   *
   * @throws {MllpConnectionFailedError} The last attempt could not open the
   *   socket.
   * @throws {MllpConnectionTimeoutError} The last attempt did not open in time.
   * @throws {MllpClientClosedError} The client is closed, or `close()` arrived
   *   while the connection was still being established.
   */
  async connect(): Promise<void> {
    const state = this.#state;
    switch (state.phase) {
      case "connected":
      case "sending": {
        return;
      }
      case "connecting": {
        await state.opening;
        return;
      }
      case "closing": {
        throw new MllpClientClosedError();
      }
      case "closed": {
        throw new MllpClientClosedError(state.reason);
      }
      case "idle": {
        const abort = new AbortController();
        const opening = this.#dial(abort.signal);
        this.#state = { abort, opening, phase: "connecting" };
        await opening;
      }
    }
  }

  /**
   * Sends one message and returns its acknowledgment. Connects first when the
   * client is not connected yet.
   *
   * Nothing is written when an option, phase, or message error is thrown.
   * Every other failure also closes the client.
   *
   * @throws {AckException} The remote system answered with a NAK. The
   *   connection stays open.
   * @throws {MllpInvalidOptionError} `timeoutMs` is out of range.
   * @throws {MllpInvalidMessageError} The message cannot be sent as-is.
   * @throws {MllpClientClosedError} The client is closed.
   * @throws {MllpAlreadySendingError} Another send is in flight.
   * @throws {MllpConnectionFailedError} The connection could not be opened.
   * @throws {MllpConnectionTimeoutError} The connection did not open in time.
   * @throws {MllpSendTimeoutError} No acknowledgment arrived in time.
   * @throws {MllpConnectionLostError} The connection was lost.
   * @throws {MllpSendAbortedError} `destroy()` cut the send off.
   * @throws {MllpInvalidResponseError} The reply is not a usable
   *   acknowledgment of this message.
   */
  async send(
    message: Root,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;
    assertTimeoutMs("timeoutMs", timeoutMs); // throws {MllpInvalidOptionError}

    const { bytes, controlId } = encode(message); // throws {MllpInvalidMessageError}

    if (!this.connected) {
      // Connect if not already connected.
      // note: if the state is closed or closing, connect() will throw before
      // we get here.
      await this.connect();
    }
    // No await from here to the move into `sending`: the phase read here is
    // the phase the move starts from.
    const state = this.#state;
    switch (state.phase) {
      case "sending": {
        // A send arriving mid-flight is refused, not queued: the caller owns
        // the sequence. Waiting instead is under review in #754.
        throw new MllpAlreadySendingError(state.controlId);
      }
      case "closing": {
        throw new MllpClientClosedError();
      }
      case "closed": {
        throw new MllpClientClosedError(state.reason);
      }
      case "idle":
      case "connecting": {
        throw new Error(
          `send() found the client ${state.phase} after it connected. This is a bug in @glion/mllp-client; please report it.`
        );
      }
      case "connected": {
        break;
      }
    }

    const done = this.#send(state.session, controlId, bytes, timeoutMs);
    this.#state = { controlId, done, phase: "sending", session: state.session };
    return await done;
  }

  /**
   * Ends the connection once the message in flight is acknowledged, and
   * resolves when it is down. New sends are refused from the moment this is
   * called. An attempt to connect stops at once.
   *
   * Resolves from any phase. Never rejects. Idempotent. The wait is bounded by
   * the in-flight send's own deadline; {@link destroy} does not wait at all.
   */
  async close(): Promise<void> {
    const from = this.#state;
    if (from.phase === "sending") {
      this.#state = {
        done: from.done,
        phase: "closing",
        session: from.session,
      };
      await Promise.allSettled([from.done]);
    }
    await this.destroy();
  }

  /**
   * Ends the connection now, and resolves when it is down. A message in flight
   * rejects with {@link MllpSendAbortedError}. An attempt to connect stops at
   * once.
   *
   * Resolves from any phase. Never rejects. Idempotent.
   */
  async destroy(): Promise<void> {
    const from = this.#state;
    this.#closed(null);
    switch (from.phase) {
      case "idle":
      case "closed": {
        return;
      }
      case "connecting": {
        from.abort.abort();
        // Its outcome belongs to the calls waiting on it.
        await Promise.allSettled([from.opening]);
        return;
      }
      case "connected":
      case "sending":
      case "closing": {
        await from.session.destroy();
      }
    }
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // ── The connection ──────────────────────────────────────────────────

  /**
   * Dials under the policy until a session opens, then moves to `connected`
   * and reports `connect`. Each attempt after the first waits
   * `delay(attempt)` first. Once the policy gives up, closes the client with
   * the last attempt's failure.
   *
   * @throws {MllpClientClosedError} `signal` aborted: the owner closed the
   *   client. Nothing is left open.
   * @throws {MllpConnectionFailedError} The last attempt could not open the
   *   socket.
   * @throws {MllpConnectionTimeoutError} The last attempt did not open in
   * time.
   */
  async #dial(signal: AbortSignal): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (attempt > 0) {
        await sleep(this.#policy.delay(attempt), signal);
      }
      if (signal.aborted) {
        throw new MllpClientClosedError();
      }
      const session = createSession(this.#socket, this.#connect, signal);
      try {
        await session.ready;
      } catch (error) {
        this.#failed(attempt, error, signal);
        continue;
      }
      if (signal.aborted) {
        // Aborted between the socket opening and this running; the session
        // ends itself on the signal.
        await session.destroy();
        throw new MllpClientClosedError();
      }
      this.#state = { phase: "connected", session };
      this.emit("connect");
      return;
    }
  }

  /**
   * Attempt `attempt` failed with `error`: returns when the policy allows
   * another. Throws `MllpClientClosedError` once `signal` has aborted, and
   * `error` once the policy is out of attempts, the client closed with it.
   */
  #failed(attempt: number, error: unknown, signal: AbortSignal): void {
    if (signal.aborted) {
      throw new MllpClientClosedError();
    }
    if (attempt < this.#policy.attempts) {
      return;
    }
    if (error instanceof MllpConnectionError) {
      this.#closed(error);
    }
    throw error;
  }

  /**
   * The terminal move, from any phase: `reason` is the failure the client
   * closes with, or `null` when the owner closes it. Once.
   */
  #closed(reason: MllpClientError | null): void {
    if (this.#state.phase === "closed") {
      return;
    }
    this.#state = { phase: "closed", reason };
    this.emit("close", reason);
  }

  // ── The exchange ────────────────────────────────────────────────────

  /**
   * One message on the wire, and the acknowledgment it comes back with.
   *
   * Settles when the send is over, however it ended.
   */
  async #send(
    session: MllpSession,
    controlId: string,
    bytes: Uint8Array,
    timeoutMs: number
  ): Promise<MllpClientResponse> {
    try {
      const reply = await this.#exchange(session, controlId, bytes, timeoutMs);
      return await this.#readAcknowledgment(session, controlId, reply);
    } finally {
      if (this.#state.phase === "sending") {
        this.#state = { phase: "connected", session };
      }
    }
  }

  /**
   * The message on the wire, and the reply it must produce to be a send.
   * Anything else closes the client.
   */
  async #exchange(
    session: MllpSession,
    controlId: string,
    bytes: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array> {
    try {
      return await session.exchange(bytes, timeoutMs);
    } catch (error) {
      if (error instanceof MllpInvalidMessageError) {
        // Raised before the writer was touched: the wire is still in step.
        throw error;
      }
      if (error instanceof MllpCodecError) {
        await this.#fail(
          session,
          new MllpInvalidResponseError(error, controlId)
        );
      }
      if (error instanceof MllpClientError) {
        await this.#fail(session, error);
      }
      throw error;
    }
  }

  /**
   * `reply` as this message's acknowledgment.
   *
   * A reply that cannot be read, or that answers another message, closes the
   * client. A NAK does not.
   */
  async #readAcknowledgment(
    session: MllpSession,
    controlId: string,
    reply: Uint8Array
  ): Promise<MllpClientResponse> {
    const answer = decode(reply, controlId);
    switch (answer.type) {
      case "accept": {
        return answer.response;
      }
      case "nak": {
        throw answer.exception;
      }
      case "invalid": {
        return await this.#fail(session, answer.error);
      }
    }
  }

  /**
   * Closes the client with `reason` and ends `session`. Throws `reason` once
   * the socket is down.
   */
  async #fail(session: MllpSession, reason: MllpClientError): Promise<never> {
    this.#closed(reason);
    await session.destroy();
    throw reason;
  }
}

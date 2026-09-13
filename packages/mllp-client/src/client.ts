import type { Root } from "@glion/ast";
import { MllpCodecError } from "@glion/mllp-codec";

import {
  assertByteCap,
  assertReconnectAttempts,
  assertTimeoutMs,
} from "./assertions";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_RECONNECT_ATTEMPTS,
  DEFAULT_SEND_TIMEOUT_MS,
} from "./constants";
import {
  MllpClientClosedError,
  MllpClientError,
  MllpInvalidResponseError,
  MllpSendAbortedError,
} from "./errors";
import { MllpClientEmitter } from "./events";
import { decode, encode } from "./messages";
import { createQueue } from "./queue";
import { defaultReconnectDelay, sleep } from "./reconnect";
import type { ReconnectPolicy } from "./reconnect";
import { createSession } from "./session";
import type { ConnectOptions, MllpSession } from "./session";
import type { Open, State } from "./state";
import type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpSendOptions,
  MllpSocket,
} from "./types";

/**
 * Sends HL7v2 messages to one remote system over MLLP and returns each
 * message's acknowledgment.
 *
 * One client owns one socket and puts one message on the wire at a time.
 * `send()` writes the message, waits for the acknowledgment, checks that it
 * answers this message, and resolves with it. A send arriving while another
 * is in flight waits its turn; sends go out in the order they were called.
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
  readonly #queue = createQueue();

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

  /** How many sends wait their turn, the one in flight excluded. */
  get pending(): number {
    return this.#queue.pending;
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
   * @throws {MllpClientClosedError} The client is closed, or `close()` or
   *   `destroy()` arrived while the connection was still being established.
   */
  async connect(): Promise<void> {
    const state = this.#state;
    let opening: Promise<void>;
    switch (state.phase) {
      case "connected":
      case "sending": {
        return;
      }
      case "closing":
      case "closed": {
        throw new MllpClientClosedError(state.reason);
      }
      case "connecting": {
        opening = state.opening;
        break;
      }
      case "idle": {
        const abort = new AbortController();
        opening = this.#dial(abort.signal);
        this.#state = { abort, opening, phase: "connecting" };
        break;
      }
    }
    try {
      await opening;
    } catch (error) {
      if (error instanceof MllpClientError) {
        await this.destroy(error);
      }
      throw error;
    }
  }

  /**
   * Sends one message and returns its acknowledgment. Connects first when the
   * client is not connected yet, and waits for the send in flight, if any,
   * before writing.
   *
   * Sends go out in the order `send()` was called. The queue has no bound.
   * `timeoutMs` runs from the moment the write starts, not from the call. A
   * send still waiting when the client closes rejects with
   * {@link MllpClientClosedError}; one waiting behind a dial that fails
   * rejects with the dial's error, as `connect()` does.
   *
   * Nothing is written when an option, phase, or message error is thrown.
   * Every wire failure also closes the client; a NAK does not.
   *
   * @throws {AckException} The remote system answered with a NAK. The
   *   connection stays open.
   * @throws {MllpInvalidOptionError} `timeoutMs` is out of range.
   * @throws {MllpInvalidMessageError} The message cannot be sent as-is.
   * @throws {MllpClientClosedError} The client is closed, or closed while
   *   this send was waiting its turn.
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

    // Checked here so a send never waits its turn on a closing client, and
    // again at the turn, since the phase can change during the wait.
    const at = this.#state;
    switch (at.phase) {
      case "closing":
      case "closed": {
        throw new MllpClientClosedError(at.reason);
      }
      case "idle":
      case "connecting":
      case "connected":
      case "sending": {
        break;
      }
    }

    const turn = this.#queue.enter();
    try {
      if (turn.wait !== null) {
        await turn.wait;
      }
      if (!this.connected) {
        await this.connect();
      }
      const state = this.#state;
      switch (state.phase) {
        case "closing":
        case "closed": {
          throw new MllpClientClosedError(state.reason);
        }
        case "idle":
        case "connecting":
        case "sending": {
          throw new Error(
            `send() found the client ${state.phase} at its turn. This is a bug in @glion/mllp-client; please report it.`
          );
        }
        case "connected": {
          break;
        }
      }
      const done = this.#send(state.session, controlId, bytes, timeoutMs);
      this.#state = { done, phase: "sending", session: state.session };
      return await done;
    } finally {
      this.#queue.leave(turn);
    }
  }

  /**
   * Ends the connection once the message in flight is acknowledged, and
   * resolves when it is down. New sends, and sends waiting their turn, are
   * refused from the moment this is called. An attempt to connect stops at
   * once.
   *
   * Resolves from any phase. Never rejects. Idempotent. The wait is bounded by
   * the in-flight send's own deadline; {@link destroy} does not wait at all.
   * If the message it waits for fails, the client closes with that failure;
   * otherwise with `null`.
   */
  async close(): Promise<void> {
    const from = this.#state;
    switch (from.phase) {
      case "closed": {
        return;
      }
      case "closing": {
        await from.closed;
        return;
      }
      case "idle": {
        this.#state = { phase: "closed", reason: null };
        this.emit("close", null);
        return;
      }
      case "connecting":
      case "connected":
      case "sending": {
        const closed = this.#close(from);
        this.#state = {
          closed,
          phase: "closing",
          reason: null,
          session: "session" in from ? from.session : null,
        };
        this.#queue.rejectWaiting(new MllpClientClosedError());
        await closed;
      }
    }
  }

  /**
   * Ends the connection now, and resolves when it is down. A message in flight
   * rejects with {@link MllpSendAbortedError}. An attempt to connect stops at
   * once. The client closes with `reason`: the failure it reports on `close`
   * and on every later call, or `null` for the owner's own decision.
   *
   * Resolves from any phase. Never rejects. Idempotent. Sends waiting their
   * turn are rejected with `reason` when its delivery is `not-sent`, and with
   * {@link MllpClientClosedError} carrying `reason` otherwise. Arriving while
   * the client is already closing, it cuts the message in flight and joins
   * the ending under way; `reason` is not recorded.
   */
  async destroy(reason: MllpClientError | null = null): Promise<void> {
    const from = this.#state;
    switch (from.phase) {
      case "closed": {
        return;
      }
      case "closing": {
        // A close() waiting out the message in flight: cut it.
        await from.session?.destroy();
        await from.closed;
        return;
      }
      case "idle": {
        this.#state = { phase: "closed", reason };
        this.emit("close", reason);
        return;
      }
      case "connecting":
      case "connected":
      case "sending": {
        const closed = this.#destroy(from, reason);
        this.#state = {
          closed,
          phase: "closing",
          reason,
          session: "session" in from ? from.session : null,
        };
        // A waiter's message was never written, so a failure of unknown
        // delivery is not its own.
        this.#queue.rejectWaiting(
          reason?.delivery === "not-sent"
            ? reason
            : new MllpClientClosedError(reason)
        );
        await closed;
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
   * `delay(attempt)` first.
   *
   * @throws {MllpClientClosedError} `signal` aborted: the owner closed the
   *   client. Nothing is left open.
   * @throws {MllpConnectionFailedError} The policy gave up; the last attempt
   *   could not open the socket.
   * @throws {MllpConnectionTimeoutError} The policy gave up; the last attempt
   *   did not open in time.
   */
  async #dial(signal: AbortSignal): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (attempt > 0) {
        await sleep(this.#policy.delay(attempt), signal);
      }
      if (signal.aborted) {
        throw new MllpClientClosedError(signal.reason);
      }
      const session = createSession(this.#socket, this.#connect, signal);
      try {
        await session.ready;
      } catch (error) {
        if (signal.aborted) {
          throw new MllpClientClosedError(signal.reason);
        }
        if (attempt >= this.#policy.attempts) {
          throw error;
        }
        continue;
      }
      if (signal.aborted) {
        // Aborted between the socket opening and this running; the session
        // ends itself on the signal.
        await session.destroy();
        throw new MllpClientClosedError(signal.reason);
      }
      this.#state = { phase: "connected", session };
      this.emit("connect");
      return;
    }
  }

  // ── The end ─────────────────────────────────────────────────────────

  /**
   * Lets the message in flight, if any, settle, then ends what `from` holds:
   * with the failure that ended the message on the wire, or with `null`.
   */
  async #close(from: Open): Promise<void> {
    if (from.phase !== "sending") {
      await this.#destroy(from, null);
      return;
    }
    const [outcome] = await Promise.allSettled([from.done]);
    const failure =
      outcome.status === "rejected" &&
      outcome.reason instanceof MllpClientError &&
      outcome.reason.delivery === "unknown" &&
      !(outcome.reason instanceof MllpSendAbortedError)
        ? outcome.reason
        : null;
    const closing = this.#state;
    if (failure !== null && closing.phase === "closing") {
      this.#state = { ...closing, reason: failure };
    }
    await this.#destroy(from, failure);
  }

  /**
   * Ends what `from` holds, the dial or the session, then moves to `closed`
   * with `reason` and reports `close`. A dial is aborted with `reason`.
   *
   * MUST NOT touch `#state` before its first `await`: the caller moves to
   * `closing` after calling it.
   */
  async #destroy(from: Open, reason: MllpClientError | null): Promise<void> {
    switch (from.phase) {
      case "connecting": {
        from.abort.abort(reason);
        // Its outcome belongs to the calls waiting on it.
        await Promise.allSettled([from.opening]);
        break;
      }
      case "connected":
      case "sending": {
        await from.session.destroy();
      }
    }
    this.#state = { phase: "closed", reason };
    this.emit("close", reason);
  }

  // ── The exchange ────────────────────────────────────────────────────

  /**
   * One message on the wire, and the acknowledgment it comes back with.
   *
   * Settles when the send is over, however it ended. A failure of unknown
   * delivery closes the client; a NAK, or a message refused before the
   * write, does not.
   */
  async #send(
    session: MllpSession,
    controlId: string,
    bytes: Uint8Array,
    timeoutMs: number
  ): Promise<MllpClientResponse> {
    try {
      const reply = await session.exchange(bytes, timeoutMs);
      return acknowledgment(reply, controlId);
    } catch (error) {
      const reason =
        error instanceof MllpCodecError
          ? new MllpInvalidResponseError(error, controlId)
          : error;
      // The wire is at an unknown position: no later reply can be matched.
      // During `closing`, the ending under way reports the failure.
      const outOfStep =
        reason instanceof MllpClientError && reason.delivery === "unknown";
      if (outOfStep && this.#state.phase === "sending") {
        await this.destroy(reason);
      }
      throw reason;
    } finally {
      if (this.#state.phase === "sending") {
        this.#state = { phase: "connected", session };
      }
    }
  }
}

/**
 * `reply` as the acknowledgment of the message `controlId`.
 *
 * @throws {AckException} The reply is a NAK.
 * @throws {MllpInvalidResponseError} The reply cannot be read, or answers
 *   another message.
 */
function acknowledgment(
  reply: Uint8Array,
  controlId: string
): MllpClientResponse {
  const answer = decode(reply, controlId);
  switch (answer.type) {
    case "accept": {
      return answer.response;
    }
    case "nak": {
      throw answer.exception;
    }
    case "invalid": {
      throw answer.error;
    }
  }
}

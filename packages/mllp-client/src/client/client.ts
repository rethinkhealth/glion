import type { Root } from "@glion/ast";
import { MllpCodecError } from "@glion/mllp-codec";

import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_SEND_TIMEOUT_MS,
} from "../constants";
import {
  MllpClientClosedError,
  MllpClientError,
  MllpConnectionLostError,
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
  assertConnecting,
  assertConnection,
  assertReadyToConnect,
  assertReadyToSend,
  assertTimeoutMs,
} from "./assertions";
import { createConnection } from "./connection";
import type { MllpConnection } from "./connection";
import { MllpClientEmitter } from "./events";
import { decode, encode } from "./messages";
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
 * time. `state` reports the phase. After `close()`, or after a failure that
 * ended the connection, every call rejects with {@link MllpClientClosedError};
 * a new client is the way back.
 *
 * ## Errors
 *
 * When the remote system answers `AE`, `AR`, `CE`, or `CR`, `send()` rejects
 * with the matching `@glion/ack` exception and the connection stays open.
 */
export class MllpClient extends MllpClientEmitter {
  readonly #socket: MllpSocket;
  readonly #connectTimeoutMs: number;
  readonly #sendTimeoutMs: number;
  readonly #maxBufferedBytes: number;
  #state: State = { phase: "idle" };
  /** The one connection this client ever makes, once it starts making it. */
  #connection: MllpConnection | null = null;

  /** @throws {MllpInvalidOptionError} A timeout or byte cap is out of range. */
  constructor(opts: MllpClientOptions) {
    super();
    this.#socket = opts.socket;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#maxBufferedBytes =
      opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;

    assertTimeoutMs("connectTimeoutMs", this.#connectTimeoutMs);
    assertTimeoutMs("sendTimeoutMs", this.#sendTimeoutMs);
    assertByteCap("maxBufferedBytes", this.#maxBufferedBytes);
  }

  /**
   * The current phase: `idle`, `connecting`, `connected`, `sending`, or
   * `closed`.
   */
  get state(): MllpClientState {
    return this.#state.phase;
  }

  /** Whether the connection is open. True in both `connected` and `sending`. */
  get connected(): boolean {
    return this.#state.phase === "connected" || this.#state.phase === "sending";
  }

  /**
   * Opens the connection ahead of the first `send()`.
   *
   * Idempotent: a connected client resolves at once, and a call arriving while
   * an attempt is in flight waits for that attempt and shares its outcome.
   *
   * @throws {MllpConnectFailedError} The socket could not be opened.
   * @throws {MllpConnectTimeoutError} The socket did not open in time.
   * @throws {MllpClientClosedError} The client is closed, or `close()` arrived
   *   while the connection was still being established.
   */
  async connect(): Promise<void> {
    const state = this.#state;
    assertReadyToConnect(state);
    if (state.phase === "connected" || state.phase === "sending") {
      return;
    }
    if (state.phase === "connecting") {
      await state.ready;
      return;
    }

    this.#connection = createConnection(this.#socket, {
      maxBufferedBytes: this.#maxBufferedBytes,
      timeoutMs: this.#connectTimeoutMs,
    });
    // Started before the phase that holds it. Nothing awaits in between, so
    // the attempt cannot outrun the transition.
    const ready = this.#connect();
    this.#transition(state, () => ({ phase: "connecting", ready }));
    await ready;
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
   * @throws {MllpSendTimeoutError} No acknowledgment arrived in time.
   * @throws {MllpConnectionLostError} The connection was lost.
   * @throws {MllpInvalidResponseError} The reply is not a usable
   *   acknowledgment of this message.
   */
  async send(
    message: Root,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;
    assertTimeoutMs("timeoutMs", timeoutMs);

    // Encoded before connecting, so a message the client cannot send never
    // opens a socket.
    // This encoding can throw if the message cannot be serialized or encoded.
    const { bytes, controlId } = encode(message);

    if (!this.connected) {
      await this.connect();
    }
    // No await from here to the move into `sending`: the phase the assertion
    // narrows is the phase the move starts from.
    const state = this.#state;
    assertReadyToSend(state);

    // Started before the phase that holds it, the same way `connect()` starts
    // its attempt. Nothing awaits in between.
    const done = this.#send(controlId, bytes, timeoutMs);
    this.#transition(state, () => ({ controlId, done, phase: "sending" }));
    return await done;
  }

  /**
   * Ends the connection once the message in flight is acknowledged, and
   * resolves when it is down. New sends are refused from the moment this is
   * called.
   *
   * Resolves from any phase. Never rejects. Idempotent. The wait is bounded by
   * the in-flight send's own deadline; {@link destroy} does not wait at all.
   */
  async close(): Promise<void> {
    const from = this.#state;
    if (from.phase === "sending") {
      this.#transition(from, () => ({ done: from.done, phase: "closing" }));
    }
    const closing = this.#state;
    if (closing.phase === "closing") {
      // Settlement, not outcome: the send's failure belongs to its caller.
      await Promise.allSettled([closing.done]);
    }
    await this.destroy();
  }

  /**
   * Ends the connection now, and resolves when it is down. A message in flight
   * rejects with {@link MllpClientClosedError}.
   *
   * Resolves from any phase. Never rejects. Idempotent.
   */
  async destroy(): Promise<void> {
    this.#close(this.#state, null);
    // The teardown `#close` started, or one an earlier call started:
    // `destroy` hands back the same promise and ignores a second reason.
    await this.#connection?.destroy();
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // ── State changes ───────────────────────────────────────────────────

  /**
   * Opens the connection and moves the phase to `connected`. A failed attempt
   * closes the client, which never reconnects.
   *
   * Settles only after the move, which is what the `connecting` phase holds,
   * so a second `connect()` reads a settled client either way.
   */
  async #connect(): Promise<void> {
    try {
      await this.#connection?.ready;
    } catch (error) {
      // A cancelled attempt already rejects with the reason `#close` gave it,
      // and `#close` does nothing twice, so this is only ever the attempt's
      // own failure.
      this.#fail(this.#state, error);
    }

    // Read only now: the `connecting` phase does not exist until `connect()`
    // installs it, which happens after this method's first await.
    const opening = this.#state;
    assertConnecting(opening);
    this.#transition(opening, () => ({ phase: "connected" }));
    this.emit("connect");
  }

  /**
   * The only way the state changes. Replaces it with `next()`, but only if it
   * is still `from`, the snapshot the caller read before deciding to move.
   * `next` is called only when it does.
   *
   * A caller that has not awaited since reading `from` always moves. One that
   * has may find another call moved the client on, and then this does nothing:
   * `send()` relies on that to leave a `closed` phase standing, and so does a
   * send deadline that fires after its send completed.
   */
  #transition(from: State, next: () => State): void {
    if (this.#state !== from) {
      return;
    }
    this.#state = next();
  }

  /**
   * Closes the client, releasing whatever `from` has open. Does nothing once
   * the phase has moved on from `from`: a send deadline that fires after its
   * send completed, or a failure a `close()` already got to.
   */
  #close(from: State, reason: unknown): void {
    if (from.phase === "closed" || this.#state !== from) {
      return;
    }
    // Whatever is in flight is failed with the error that ended the client,
    // or with the owner's own close when nothing failed.
    void this.#connection?.destroy(reason ?? new MllpClientClosedError());
    this.#transition(from, () => ({ phase: "closed" }));
    if (["connected", "sending", "closing"].includes(from.phase)) {
      this.emit(
        "disconnect",
        reason instanceof MllpClientError ? reason : null
      );
    }
    this.emit("close");
  }

  /** Closes the client because `reason` ended it, then throws `reason`. */
  #fail(from: State, reason: unknown): never {
    this.#close(from, reason);
    throw reason;
  }

  /**
   * One message on the wire, and the acknowledgment it comes back with.
   *
   * Settles when the send is over, which is what the `sending` phase holds so
   * a graceful `close()` can wait it out.
   */
  async #send(
    controlId: string,
    bytes: Uint8Array,
    timeoutMs: number
  ): Promise<MllpClientResponse> {
    try {
      const reply = await this.#exchange(controlId, bytes, timeoutMs);
      return this.#readAcknowledgment(controlId, reply);
    } finally {
      // A no-op once the client has moved on: `#close` may have closed it, or
      // `close()` may be waiting the send out from `closing`.
      const state = this.#state;
      if (state.phase === "sending") {
        this.#transition(state, () => ({ phase: "connected" }));
      }
    }
  }

  // ── The exchange ────────────────────────────────────────────────────

  /** The message on the wire, and the reply it must produce to be a send. */
  async #exchange(
    controlId: string,
    bytes: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array> {
    assertConnection(this.#connection);

    let reply: Uint8Array | null;
    try {
      reply = await this.#connection.exchange(bytes, timeoutMs);
    } catch (error) {
      if (error instanceof MllpInvalidMessageError) {
        // Raised before the writer was touched, so the wire is still in step
        // and the client stays usable for the next message.
        throw error;
      }
      this.#exchangeFailed(controlId, error);
    }

    if (reply === null) {
      this.#exchangeFailed(controlId);
    }
    return reply;
  }

  /**
   * `reply` as this message's acknowledgment.
   *
   * A reply that cannot be read, or that answers another message, ends the
   * connection. A NAK does not: the remote system understood the message, so
   * the wire is still in step.
   */
  #readAcknowledgment(
    controlId: string,
    reply: Uint8Array
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
        this.#fail(this.#state, answer.error);
      }
    }
  }

  /**
   * What an exchange that produced no usable acknowledgment fails with: the
   * reason the connection was closed when a `close()` or a deadline interrupted
   * it, {@link MllpInvalidResponseError} for bytes the codec could not read, and
   * {@link MllpConnectionLostError} for a connection that is gone.
   *
   * Ends the client in every case.
   */
  #exchangeFailed(controlId: string, cause?: unknown): never {
    if (cause instanceof MllpClientError) {
      // Whatever closed the connection rejected this read with its own reason.
      this.#fail(this.#state, cause);
    }
    const error =
      cause instanceof MllpCodecError
        ? new MllpInvalidResponseError(cause, controlId)
        : new MllpConnectionLostError(controlId, cause);
    this.#fail(this.#state, error);
  }
}

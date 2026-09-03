/**
 * `MllpClient`: one connection, one message on the wire at a time.
 *
 * HL7v2 over MLLP is lockstep. The client writes a message, and the next
 * frame from the remote system is its acknowledgment. `send()` is exactly
 * that: one write, then one read. There is no background reader and no queue.
 *
 * All lifecycle state is the single `#state` field, a union of immutable
 * phase objects. A phase changes by replacing the object, never by mutating
 * it, and every replacement goes through `#transition()`, which moves only
 * from the snapshot the caller read. A method that awaited in between may
 * find that another call moved the client on; that is how a racing
 * `close()` is detected.
 *
 * Everything that ends the connection, whether `close()`, a timeout, a lost
 * peer, or an unusable acknowledgment, goes through `#shutdown()`, with the
 * error that caused it as the closed state's reason.
 *
 * This is the only layer that throws `MllpClientError`s. Whatever the codec,
 * the connector, or the streams throw is wrapped here, on `cause`.
 *
 * @module
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  AckCommitError,
  AckCommitReject,
  isAckNakCode,
} from "@glion/ack";
import { MllpCodecError, unframe } from "@glion/mllp-codec";
import type { UnframeOptions } from "@glion/mllp-codec";

import { decode, encode } from "./codec";
import type { Acknowledgment, EncodedMessage } from "./codec";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_SEND_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from "./constants";
import {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpConnectAbortedError,
  MllpConnectFailedError,
  MllpConnectTimeoutError,
  MllpDroppedError,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpInvalidResponseError,
  MllpSendTimeoutError,
} from "./errors";
import type { MllpClientError, MllpDelivery } from "./errors";
import type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpConnection,
  MllpConnector,
  MllpSendOptions,
  SendInput,
} from "./types";

type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "connecting";
      /** Cancels the connector when `close()` arrives first. */
      readonly abort: AbortController;
      /** The connector's promise; a second `connect()` waits on it. */
      readonly connection: Promise<MllpConnection>;
    }
  | {
      readonly phase: "connected";
      /**
       * Messages from the remote system, one per read: the connection's
       * readable piped through `unframe`. The pipe locks the readable, so the
       * connection's bytes are only ever read here, de-framed.
       */
      readonly reader: ReadableStreamDefaultReader<Uint8Array>;
      /** Framed messages to the remote system. */
      readonly writer: WritableStreamDefaultWriter<Uint8Array>;
      /** Ends the connection: the adapter's `close()`. */
      readonly close: () => Promise<void>;
    }
  | {
      readonly phase: "sending";
      readonly reader: ReadableStreamDefaultReader<Uint8Array>;
      readonly writer: WritableStreamDefaultWriter<Uint8Array>;
      readonly close: () => Promise<void>;
      /** MSH-10 of the message waiting for its acknowledgment. */
      readonly controlId: string;
    }
  | {
      readonly phase: "closed";
      /** Why the client closed; `null` for an owner `close()`. */
      readonly reason: MllpClientError | null;
      /** The connection teardown every `close()` awaits. */
      readonly teardown: Promise<void>;
    };

/** The teardown of a client that never opened a connection. */
const NOTHING_TO_TEAR_DOWN: Promise<void> = Promise.resolve();

// TODO(#689): replace with the shared reader from @glion/ack once it exists.
const NAK_EXCEPTIONS = {
  [AckCode.ApplicationError]: AckApplicationError,
  [AckCode.ApplicationReject]: AckApplicationReject,
  [AckCode.CommitError]: AckCommitError,
  [AckCode.CommitReject]: AckCommitReject,
} as const;

/**
 * Sends HL7v2 messages to one remote system over MLLP and returns each
 * message's acknowledgment.
 *
 * One client owns one TCP connection and sends one message at a time, which
 * is what the protocol requires: the next frame the remote system writes
 * after a message is that message's acknowledgment. `send()` writes the
 * message, waits for the acknowledgment, checks that it answers this message,
 * and resolves with it.
 *
 * ## Usage
 *
 * Send as many messages as needed, then close. `send()` connects on first
 * use; `connect()` opens the connection ahead of time when that is useful,
 * for example to fail fast at startup.
 *
 * ```ts
 * import { MllpClient } from "@glion/mllp-client";
 * import { connectNode } from "@glion/mllp-client/node";
 *
 * const client = new MllpClient({
 *   connect: connectNode,
 *   host: "hl7.example.org",
 *   port: 2575,
 * });
 *
 * await client.connect();
 * try {
 *   const ack = await client.send(adtMessage); // HL7v2 text, or a parsed Root
 *   ack.code; // "AA" or "CA": the remote system accepted the message
 * } finally {
 *   await client.close();
 * }
 * ```
 *
 * Or scope the client to a block with `await using`:
 *
 * ```ts
 * await using client = new MllpClient({
 *   connect: connectNode,
 *   host,
 *   port,
 * });
 * const ack = await client.send(adtMessage);
 * ```
 *
 * ## Lifecycle
 *
 * ```text
 * idle → connecting → connected ⇄ sending → closed
 * ```
 *
 * `state` reports the current phase. A client closes once and never
 * reconnects: after `close()`, or after a failure that ends the connection,
 * every call rejects with {@link MllpClientClosedError}, and a new client is
 * the way back. d
 *
 * ## Errors
 *
 * A NAK is not an error of the client. When the remote system answers with
 * `AE`, `AR`, `CE`, or `CR`, `send()` rejects with the matching
 * `@glion/ack` exception, and the connection stays open.
 *
 * Everything the client itself raises extends {@link MllpClientError}. Each
 * subclass is one situation, each carries a stable `code`, and each carries
 * `delivery`: `not-sent` when nothing reached the wire, `unknown` when the
 * message may have been received. The failures that can happen after the
 * message is written, a timeout, a lost connection, or an unusable reply,
 * also close the client, because acknowledgments on that connection can no
 * longer be matched safely.
 *
 * ```ts
 * import { AckException } from "@glion/ack";
 * import { MllpClientError } from "@glion/mllp-client";
 *
 * try {
 *   await client.send(adtMessage);
 * } catch (error) {
 *   if (error instanceof AckException) {
 *     // The remote system understood the message and rejected it.
 *     // The connection is still open; error.text carries its reason.
 *   } else if (error instanceof MllpClientError) {
 *     // The client or the wire failed. error.code says what happened, and
 *     // error.delivery says whether the message may have been received.
 *   }
 * }
 * ```
 *
 * ## Runtimes
 *
 * The client speaks to the network through the `connect` option, an
 * {@link MllpConnector} that opens one connection as a pair of byte streams.
 * The Node adapter ships as `@glion/mllp-client/node`; other runtimes
 * implement the same small interface.
 */
function assertTimeoutMs(option: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new MllpInvalidOptionError(
      option,
      `a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}`,
      ms
    );
  }
}

function assertByteCap(option: string, bytes: number): void {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new MllpInvalidOptionError(option, "a positive integer", bytes);
  }
}

/** `encode`, with the codec's failure wrapped as the client's error. */
function encodeMessage(message: SendInput): EncodedMessage {
  try {
    return encode(message);
  } catch (error) {
    throw new MllpInvalidMessageError(error);
  }
}

export class MllpClient {
  readonly #endpoint: { readonly host: string; readonly port: number };
  readonly #connector: MllpConnector;
  readonly #connectTimeoutMs: number;
  readonly #sendTimeoutMs: number;
  readonly #framing: Required<UnframeOptions>;
  #state: State = { phase: "idle" };

  /** @throws {MllpInvalidOptionError} A timeout or byte cap is out of range. */
  constructor(opts: MllpClientOptions) {
    // Initialize the client's endpoint, connector, and timeout/byte cap settings.
    this.#endpoint = { host: opts.host, port: opts.port };
    this.#connector = opts.connect;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#framing = {
      maxBufferedBytes: opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES,
    };

    // Assertions and validations for the provided options.
    assertTimeoutMs("connectTimeoutMs", this.#connectTimeoutMs);
    assertTimeoutMs("sendTimeoutMs", this.#sendTimeoutMs);
    assertByteCap("maxBufferedBytes", this.#framing.maxBufferedBytes);
  }

  /** Host name or address of the remote system. */
  get host(): string {
    return this.#endpoint.host;
  }

  /** TCP port of the remote system. */
  get port(): number {
    return this.#endpoint.port;
  }

  /**
   * The current phase of the client's lifecycle.
   *
   * `idle` before the first `connect()`, `connecting` while an attempt is in
   * flight, `connected` while the connection is open and free, `sending`
   * while a message is waiting for its acknowledgment, and `closed` once the
   * client is done, whether by `close()` or by a failure. Useful for logging
   * and health checks; the methods enforce it themselves.
   */
  get state(): MllpClientState {
    return this.#state.phase;
  }

  /**
   * Whether the connection is open. True in both `connected` and `sending`.
   */
  get connected(): boolean {
    return this.#state.phase === "connected" || this.#state.phase === "sending";
  }

  /**
   * Open the connection ahead of the first `send()`, which would otherwise
   * open it. Idempotent: a connected client resolves at once, and a call that
   * arrives while an attempt is in flight waits for that attempt.
   *
   * @throws {MllpConnectFailedError} The connection could not be opened.
   * @throws {MllpConnectTimeoutError} The connection did not open in time.
   * @throws {MllpConnectAbortedError} `close()` arrived first.
   * @throws {MllpClientClosedError} The client is already closed.
   */
  async connect(): Promise<void> {
    const state = this.#readyToConnectOrThrow();
    if (state.phase === "connected" || state.phase === "sending") {
      return;
    }
    if (state.phase === "connecting") {
      // Another call is running the attempt. Its continuation was registered
      // on `opening` first, so it resumes first and moves the state before
      // this one reads it.
      await Promise.allSettled([state.connection]);
      this.#assertConnection();
      return;
    }

    // Two ways the attempt can be cut short, on one signal: `abort` is ours,
    // fired by close(); the deadline adds the timeout. Whether close() won is
    // decided by the state below, not by the signal.
    const abort = new AbortController();
    const deadline = AbortSignal.any([
      abort.signal,
      AbortSignal.timeout(this.#connectTimeoutMs),
    ]);
    let connectionPromise: Promise<MllpConnection>;
    try {
      connectionPromise = this.#connector({
        ...this.#endpoint,
        signal: deadline,
      });
    } catch (error) {
      // A connector that throws is a connector that rejected.
      connectionPromise = Promise.reject(error);
    }
    const connecting: State = {
      abort,
      connection: connectionPromise,
      phase: "connecting",
    };
    this.#transition(state, () => connecting);

    let connection: MllpConnection;
    try {
      connection = await connectionPromise;
    } catch (error) {
      const reason = deadline.aborted
        ? new MllpConnectTimeoutError(this.#connectTimeoutMs)
        : new MllpConnectFailedError(error);
      const closed = this.#transition(connecting, () => ({
        phase: "closed",
        reason,
        teardown: NOTHING_TO_TEAR_DOWN,
      }));
      if (!closed) {
        throw new MllpConnectAbortedError();
      }
      throw reason;
    }

    if (deadline.aborted && !abort.signal.aborted) {
      // The connector resolved after the deadline: too late to use.
      const reason = new MllpConnectTimeoutError(this.#connectTimeoutMs);
      const teardown = connection.close();
      if (
        this.#transition(connecting, () => ({
          phase: "closed",
          reason,
          teardown,
        }))
      ) {
        throw reason;
      }
      throw new MllpConnectAbortedError();
    }
    const connected = this.#transition(connecting, () => ({
      close: () => connection.close(),
      phase: "connected",
      reader: connection.readable
        .pipeThrough(unframe(this.#framing))
        .getReader(),
      writer: connection.writable.getWriter(),
    }));
    if (!connected) {
      // close() moved the client on in the instant before the connector
      // resolved; its teardown disposes of the connection.
      throw new MllpConnectAbortedError();
    }
  }

  /**
   * Send one message and return its acknowledgment. Connects first when the
   * client is not connected yet.
   *
   * Nothing is written when an option, state, or message error is thrown.
   * Every other failure also closes the client, because the connection can no
   * longer be trusted to be in step; check `delivery` before sending the
   * message again.
   *
   * @throws {AckException} The remote system answered with a NAK. The
   *   connection stays open.
   * @throws {MllpInvalidOptionError} `timeoutMs` is out of range.
   * @throws {MllpClientClosedError} The client is closed.
   * @throws {MllpAlreadySendingError} Another send is in flight.
   * @throws {MllpInvalidMessageError} The message cannot be sent as-is.
   * @throws {MllpSendTimeoutError} No acknowledgment arrived in time.
   * @throws {MllpDroppedError} The connection was lost.
   * @throws {MllpInvalidResponseError} The reply is not a usable
   *   acknowledgment.
   */
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;
    assertTimeoutMs("timeoutMs", timeoutMs);

    const encoded = encodeMessage(message);
    if (!this.connected) {
      try {
        await this.connect();
      } catch (error) {
        // For the send, close() cancelling the attempt is the client closing.
        throw error instanceof MllpConnectAbortedError
          ? new MllpClientClosedError()
          : error;
      }
    }
    // No await from here to the move into `sending`: the state the guard
    // returns is the state the move starts from.
    const state = this.#readyToSendOrThrow();

    const sending: State = {
      ...state,
      controlId: encoded.controlId,
      phase: "sending",
    };
    this.#transition(state, () => sending);

    try {
      const bytes = await this.#exchange(sending, encoded, timeoutMs);
      const ack = this.#decode(bytes, encoded.controlId);
      if (isAckNakCode(ack.code)) {
        throw new NAK_EXCEPTIONS[ack.code](
          `The remote system did not accept message ${encoded.controlId}: acknowledgment code ${ack.code}.`,
          {
            controlId: encoded.controlId,
            errorCode: ack.errorCode,
            severity: ack.severity,
            text: ack.text,
          }
        );
      }
      return { code: ack.code, raw: ack.raw, tree: ack.tree };
    } finally {
      // Back to the state the send started from, unless a failure or close()
      // moved the client to closed in the meantime; that stands.
      this.#transition(sending, () => state);
    }
  }

  /**
   * End the connection. Resolves from any phase, never rejects, and resolves
   * once the connection is actually closed. An in-flight `send()` rejects
   * with {@link MllpClientClosedError}.
   */
  async close(): Promise<void> {
    const state = this.#state;
    switch (state.phase) {
      case "idle": {
        this.#transition(state, () => ({
          phase: "closed",
          reason: null,
          teardown: NOTHING_TO_TEAR_DOWN,
        }));
        break;
      }
      case "connecting": {
        state.abort.abort();
        const { connection } = state;
        const teardown = (async () => {
          let late: MllpConnection;
          try {
            late = await connection;
          } catch {
            return; // the attempt failed; there is nothing to dispose of
          }
          await late.close();
        })();
        this.#transition(state, () => ({
          phase: "closed",
          reason: null,
          teardown,
        }));
        await teardown;
        break;
      }
      case "connected":
      case "sending": {
        await this.#shutdown(null);
        break;
      }
      case "closed": {
        await state.teardown;
        break;
      }
    }
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // ── State changes ───────────────────────────────────────────────────

  /**
   * The only way the state changes. Replaces it with `next()`, but only if it
   * is still `from`, the snapshot the caller read before deciding to move.
   * Returns whether the move happened.
   *
   * A caller that read `from` and has not awaited since always moves, because
   * nothing else can run in between. A caller that awaited in between may
   * find that another call moved the client on; it then reads the current
   * state to learn who won. `next` is a function so that nothing is built,
   * and no stream is locked, unless the move happens.
   */
  #transition(from: State, next: () => State): boolean {
    if (this.#state !== from) {
      return false;
    }
    this.#state = next();
    return true;
  }

  /** Ends the connection once; later calls join the same teardown. */
  #shutdown(reason: MllpClientError | null): Promise<void> {
    const state = this.#state;
    switch (state.phase) {
      case "idle":
      case "connecting": {
        return NOTHING_TO_TEAR_DOWN;
      }
      case "closed": {
        return state.teardown;
      }
      case "connected":
      case "sending": {
        const { close, reader, writer } = state;
        const teardown = (async () => {
          // Release the streams, do not cancel them: cancelling would destroy
          // the socket under the adapter and skip its graceful close. A read
          // parked on the released reader rejects, which wakes the send.
          reader.releaseLock();
          writer.releaseLock();
          await close();
        })();
        this.#transition(state, () => ({ phase: "closed", reason, teardown }));
        return teardown;
      }
    }
  }

  // ── Guards ──────────────────────────────────────────────────────────
  // Each returns the state an operation needs, or throws the error that says
  // why the current phase cannot provide it. The switches are exhaustive, so
  // a new phase has to say what it means for every operation.

  /** Any state a connection attempt can start from, join, or is done in. */
  #readyToConnectOrThrow(): Exclude<State, { phase: "closed" }> {
    const state = this.#state;
    switch (state.phase) {
      case "idle":
      case "connecting":
      case "connected":
      case "sending": {
        return state;
      }
      case "closed": {
        throw new MllpClientClosedError(state.reason ?? undefined);
      }
    }
  }

  /** The connected state with nothing in flight. */
  #readyToSendOrThrow(): Extract<State, { phase: "connected" }> {
    const state = this.#state;
    switch (state.phase) {
      case "idle":
      case "connecting": {
        // send() connects before asking, so these phases cannot reach here.
        throw new Error("send() asked for readiness before connecting");
      }
      case "sending": {
        throw new MllpAlreadySendingError(state.controlId);
      }
      case "closed": {
        throw new MllpClientClosedError(state.reason ?? undefined);
      }
      case "connected": {
        return state;
      }
    }
  }

  /**
   * Once an attempt has settled, the client is either connected or closed.
   * The `connect()` that ran the attempt classified its failure and stored it
   * as the closed reason; a caller that waited on the attempt throws that
   * same error. A closed state with no reason means close() cancelled the
   * attempt.
   */
  #assertConnection(): void {
    const outcome = this.#state;
    if (outcome.phase === "closed") {
      throw outcome.reason ?? new MllpConnectAbortedError();
    }
  }

  // ── The exchange ────────────────────────────────────────────────────

  /**
   * Reads the frame that answered the message with `controlId`.
   *
   * A frame that is not a usable acknowledgment of that message ends the
   * connection. `send()` relies on MLLP being lockstep, one frame answering
   * one message, and an unreadable frame or one that answers a different
   * message means the connection is no longer known to be in step. Reading
   * on would risk taking a stray frame as the next message's acknowledgment,
   * which is a message reported as accepted that never was.
   */
  #decode(bytes: Uint8Array, controlId: string): Acknowledgment {
    try {
      return decode(bytes, controlId);
    } catch (error) {
      // Correlation can no longer be trusted on this connection; the caller
      // learns through `delivery` that the message's fate is unknown.
      const invalid = new MllpInvalidResponseError(controlId, error);
      void this.#shutdown(invalid);
      throw invalid;
    }
  }

  /**
   * One write, then one read, within `timeoutMs`. The deadline closes the
   * connection, which wakes the parked read; the read then reports the
   * timeout as the reason the exchange did not complete. Whether the write
   * completed decides the `delivery` of a failure.
   */
  async #exchange(
    sending: Extract<State, { phase: "sending" }>,
    message: EncodedMessage,
    timeoutMs: number
  ): Promise<Uint8Array> {
    // The deadline closes the connection with the timeout as the reason; that
    // wakes the parked read, which then reports the timeout.
    const deadline = setTimeout(() => {
      void this.#shutdown(
        new MllpSendTimeoutError(message.controlId, timeoutMs)
      );
    }, timeoutMs);
    let written = false;
    try {
      await sending.writer.write(message.framed);
      written = true;
      const next = await sending.reader.read();
      if (!next.done) {
        return next.value;
      }
    } catch (error) {
      this.#connectionLost(
        message.controlId,
        written ? "unknown" : "not-sent",
        error
      );
    } finally {
      clearTimeout(deadline);
    }
    this.#connectionLost(message.controlId, "unknown");
  }

  /**
   * What an interrupted send fails with: whatever already closed the client
   * (a timeout, or `close()`), or, when this send is the first to notice,
   * `MllpInvalidResponseError` for a frame the codec could not read and
   * `MllpDroppedError` for a connection that is gone.
   */
  #connectionLost(
    controlId: string,
    delivery: MllpDelivery,
    cause?: unknown
  ): never {
    if (this.#state.phase === "closed") {
      throw (
        this.#state.reason ?? new MllpClientClosedError(undefined, delivery)
      );
    }
    const error =
      cause instanceof MllpCodecError
        ? new MllpInvalidResponseError(controlId, cause)
        : new MllpDroppedError(controlId, delivery, cause);
    void this.#shutdown(error);
    throw error;
  }
}

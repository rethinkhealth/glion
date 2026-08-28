/**
 * The `MllpClient` — a persistent MLLP client for HL7v2.
 *
 * A plain TypeScript implementation: one client owns one connection for its
 * lifetime. The connection lifecycle is a small phase field (`idle → connecting
 * → connected → closed`) plus a single-flight latch; there is no state-machine
 * framework. The per-connection wire — read loop, frame decoder, the single
 * in-flight ACK deferred, drop detection — lives in {@link Connection}
 * (`./connection.ts`), which the client drives directly: `send()` is `await
 * connection.exchange(...)`, a real request/response `Promise`. That direct
 * call is the whole point — a native client owns the connection object, so
 * getting the response back is a method return, not a framework bridge.
 *
 * Single-flight: one send is on the wire at a time; a concurrent `send()`
 * rejects with `SEND_IN_PROGRESS`. (A FIFO queue and connection retry are
 * future work; the default is connect-once, no retry.)
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-transport";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

import type { MllpClientResponse } from "./ack";
import { createConnection } from "./connection";
import type { Connection } from "./connection";
import { MllpClientError, MllpErrorCode } from "./errors";

export type { MllpClientResponse } from "./ack";

/**
 * What `MllpClient.send()` accepts — a `string` (serialized HL7v2 text) or a
 * `Root` (a parsed tree). Both are normalized to a tree and re-serialized to
 * canonical HL7v2 for the wire: the client is an *originating / cleaning*
 * client, not a byte-exact relay. A `string` is parsed; a `Root` is used as-is.
 *
 * Cleaning is syntactic only — semantics are preserved. Line endings normalize
 * to CR and trailing empty fields / segments are trimmed; escape sequences,
 * Z-segments, repetitions, and components round-trip verbatim. Two caveats:
 * trailing-empty trimming is not idempotent (it drops one trailing empty field
 * per pass), and a `Root` that was escape-_decoded_ upstream (e.g. via
 * `hl7v2DecodeEscapes`) must NOT be sent — `toHl7v2` has no re-encode step and
 * would emit the decoded literal.
 *
 * Raw bytes are NOT accepted — decode them to text at your I/O boundary (where
 * charset / MSH-18 knowledge lives) and pass the `string`.
 */
export type SendInput = string | Root;

/**
 * Bidirectional byte-stream contract that runtime adapters satisfy.
 *
 * **Adapter responsibilities** (the client trusts these; adapter tests enforce
 * them): `close()` MUST resolve (never reject) and be idempotent; `closed` MUST
 * resolve when either side ends the connection while the consumer is draining
 * `readable`, and must not reject.
 */
export interface MllpDuplex {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  readonly closed: Promise<void>;
}

/**
 * Opens one connection to the target. **Contract — honour the `signal`:** if it
 * aborts, reject and leave nothing live (including the race where the
 * connection opens just after the abort — close that orphan). The client passes
 * a signal it aborts on `connectTimeoutMs` or `close()`, and trusts this
 * contract.
 */
export type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;

/** The client's connection phase. */
export type MllpClientState = "closed" | "connected" | "connecting" | "idle";

export interface MllpSendOptions {
  /** Overrides the default ACK-wait deadline (ms) for this send. */
  readonly timeoutMs?: number;
}

export interface MllpClientOptions {
  readonly host: string;
  readonly port: number;
  /** Runtime adapter; e.g. `connectNode` from `@glion/mllp-client/node`. */
  readonly connect: MllpConnector;
  /** Default 30 000 ms. */
  readonly connectTimeoutMs?: number;
  /** Default 30 000 ms. Per-send `timeoutMs` overrides. */
  readonly sendTimeoutMs?: number;
  /**
   * Maximum bytes buffered while decoding inbound ACK frames. Defence against
   * peers that send unterminated data. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_SEND_TIMEOUT_MS = 30_000;

/** The typed reason an in-flight connect was aborted, or a generic abort. */
function abortReason(signal: AbortSignal): MllpClientError {
  return signal.reason instanceof MllpClientError
    ? signal.reason
    : MllpClientError.connectionAborted();
}

export class MllpClient {
  readonly #host: string;
  readonly #port: number;
  readonly #connect: MllpConnector;
  readonly #connectTimeoutMs: number;
  readonly #sendTimeoutMs: number;
  readonly #maxBufferedBytes: number | undefined;

  /** The lifecycle phase — the single source of truth for `state`. */
  #phase: MllpClientState = "idle";
  /** The live wire while `connected`; `null` otherwise. */
  #connection: Connection | null = null;
  /** True while one send is awaiting its ACK (single-flight). */
  #inFlight = false;
  /** Aborts the in-flight connect (on `connectTimeoutMs` or `close()`). */
  #connectController: AbortController | null = null;

  constructor(opts: MllpClientOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#connect = opts.connect;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#maxBufferedBytes = opts.maxBufferedBytes;
  }

  /** Target host the client is configured for. */
  get host(): string {
    return this.#host;
  }

  /** Target port the client is configured for. */
  get port(): number {
    return this.#port;
  }

  /** The connection phase. */
  get state(): MllpClientState {
    return this.#phase;
  }

  /** True while the wire is up (state is `connected`). */
  get connected(): boolean {
    return this.#phase === "connected";
  }

  /**
   * Open the wire through the runtime adapter. Single-shot: each instance
   * manages one connection lifecycle. A hung connect is bounded by
   * `connectTimeoutMs`; cancel a connecting client with `close()`.
   *
   * @throws {MllpClientError} `CLOSED` when the instance is already `closed`
   *   (construct a new instance); `ALREADY_CONNECTED` when called while
   *   `connecting`/`connected`; `CONNECT_FAILED` when the adapter rejects
   *   (underlying error on `cause`); `CONNECT_TIMEOUT` when the adapter exceeds
   *   `connectTimeoutMs`; `CONNECT_ABORTED` when `close()` interrupts an
   *   in-flight connect.
   */
  async connect(): Promise<void> {
    if (this.#phase !== "idle") {
      throw this.#phase === "closed"
        ? MllpClientError.closed()
        : MllpClientError.alreadyConnected();
    }

    this.#phase = "connecting";
    const controller = new AbortController();
    this.#connectController = controller;
    const timer = setTimeout(() => {
      controller.abort(
        MllpClientError.connectionTimeout(this.#connectTimeoutMs)
      );
    }, this.#connectTimeoutMs);

    try {
      const duplex = await this.#connect({
        host: this.#host,
        port: this.#port,
        signal: controller.signal,
      });
      // The adapter opened after we aborted (timeout / close raced its resolve):
      // close the orphan and surface the abort reason. (The adapter SHOULD reject
      // on abort, but this closes the post-resolve race for free.)
      if (controller.signal.aborted) {
        await duplex.close();
        throw abortReason(controller.signal);
      }
      this.#connection = createConnection({
        duplex,
        host: this.#host,
        maxBufferedBytes: this.#maxBufferedBytes,
        onDrop: (error) => this.#handleDrop(error),
        port: this.#port,
      });
      this.#phase = "connected";
    } catch (error) {
      this.#phase = "closed";
      this.#connection = null;
      // An abort (timeout or close) carries the typed reason; anything else the
      // adapter threw is a CONNECT_FAILED.
      if (controller.signal.aborted) {
        throw abortReason(controller.signal);
      }
      throw MllpClientError.connectionFailure(error);
    } finally {
      clearTimeout(timer);
      this.#connectController = null;
    }
  }

  /**
   * Parse and send `message`, then resolve with the parsed ACK. One send is on
   * the wire at a time; a concurrent send while one is in flight rejects with
   * `SEND_IN_PROGRESS`. There is no caller cancellation signal — a send is
   * bounded by its ACK deadline, and `close()` rejects an in-flight send.
   *
   * @throws {AckException} (from `@glion/ack`) The peer returned a NAK.
   * @throws {MllpClientError} Otherwise; branch on `code`: `NOT_CONNECTED` /
   *   `CLOSED` (state guard), `SEND_IN_PROGRESS` (a send is already on the
   *   wire), `SEND_TIMEOUT`, `DROPPED` (terminal), `INVALID_RESPONSE` (the
   *   peer's reply was not a usable acknowledgment — see its `message`).
   * @throws {FramingError} The message carries an embedded MLLP framing byte
   *   (VT or FS) that cannot be framed. CR is allowed (segment terminator).
   */
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    const connection = this.#connection;
    if (this.#phase !== "connected" || connection === null) {
      throw this.#phase === "closed"
        ? MllpClientError.closed()
        : MllpClientError.notConnected();
    }
    if (this.#inFlight) {
      throw MllpClientError.sendInProgress();
    }

    this.#inFlight = true;
    try {
      // The client boundary: encode to wire bytes + correlation id once, here.
      // The parser is lenient, so a tree is always produced (MSH-10 reads as ""
      // for non-HL7v2 text). A FramingError here rejects the returned promise.
      const tree = typeof message === "string" ? parseHL7v2(message) : message;
      const framed = frame(toHl7v2(tree));
      const requestControlId = value(tree, "MSH-10[1].1.1")?.value ?? "";
      return await connection.exchange({
        framed,
        requestControlId,
        timeoutMs: opts.timeoutMs ?? this.#sendTimeoutMs,
      });
    } finally {
      this.#inFlight = false;
    }
  }

  /**
   * Tear the connection down. Idempotent: resolves from any state and never
   * rejects. An in-flight `send()` rejects with `MllpClientError` (`CLOSED`).
   */
  async close(): Promise<void> {
    if (this.#phase === "closed") {
      return;
    }
    const connection = this.#connection;
    this.#connection = null;
    // Cancel an in-flight connect; its awaiter rejects with CONNECT_ABORTED.
    if (this.#phase === "connecting") {
      this.#connectController?.abort(MllpClientError.connectionAborted());
    }
    this.#phase = "closed";
    if (connection) {
      await connection.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have been received; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    }
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * A peer drop the connection detected. With no retry, the connection is
   * terminal: `connection.ts` has already rejected any in-flight send with
   * `DROPPED`; the client only records the closed phase and releases the wire.
   */
  #handleDrop(_error: MllpClientError): void {
    this.#phase = "closed";
    this.#connection = null;
  }
}

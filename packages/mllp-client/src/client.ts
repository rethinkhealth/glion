/**
 * The `MllpClient` — a persistent MLLP client for HL7v2.
 *
 * One client owns one connection lifecycle, which is a state machine
 * (./state.ts) that IS the engine: it opens the connection, owns the live wire,
 * gates and runs single-flight sends, retries, tears down, and decides every
 * error. This class is a thin facade — it encodes the outbound message at the
 * boundary, turns each method call into a machine event carrying the caller's
 * deferred, and lets the machine settle that deferred. It holds no lifecycle
 * state and synthesizes no errors of its own.
 *
 * Single-flight: one send is on the wire at a time. A concurrent `send()` while
 * one is in flight rejects with `SEND_IN_PROGRESS`.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-transport";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

import type { MllpClientResponse } from "./ack";
import { NO_RETRY } from "./backoff";
import { MllpClientError } from "./errors";
import { createConnectionState } from "./state";
import type { ConnectionPhase, ConnectionState } from "./state";

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

export type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;

/** The client's connection phase — the connection machine's state value. */
export type MllpClientState = ConnectionPhase;

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

export class MllpClient {
  readonly #host: string;
  readonly #port: number;
  readonly #sendTimeoutMs: number;

  /** The connection lifecycle — the engine, and the single source of `state`. */
  readonly #machine: ConnectionState;

  constructor(opts: MllpClientOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;

    // The machine owns opening the connection but does not know host/port — it is
    // handed one `open` operation (the adapter, bound to this client's target).
    this.#machine = createConnectionState({
      connectTimeoutMs: opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      host: this.#host,
      maxBufferedBytes: opts.maxBufferedBytes,
      // This closure implements the OpenConnection contract: honour the abort
      // signal, including the race where the connection opens just after the
      // attempt is aborted — close that orphan rather than leaking it.
      open: async (signal) => {
        const duplex = await opts.connect({
          host: this.#host,
          port: this.#port,
          signal,
        });
        if (signal.aborted) {
          await duplex.close();
          throw MllpClientError.connectionAborted();
        }
        return duplex;
      },
      options: NO_RETRY,
      port: this.#port,
    });
  }

  /** Target host the client is configured for. */
  get host(): string {
    return this.#host;
  }

  /** Target port the client is configured for. */
  get port(): number {
    return this.#port;
  }

  get state(): MllpClientState {
    // `connected` is compound (ready/sending); the public phase flattens to it.
    const phase = this.#machine.getSnapshot().value;
    return typeof phase === "string" ? phase : "connected";
  }

  /** True while the wire is up (state is `connected`). */
  get connected(): boolean {
    return this.state === "connected";
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
  connect(): Promise<void> {
    // The machine owns the outcome: it resolves on `connected`, or rejects this
    // deferred with the typed error (illegal call, failure, timeout, abort).
    // oxlint-disable-next-line promise/avoid-new -- bridge: machine event → caller promise
    return new Promise<void>((resolve, reject) => {
      this.#machine.send({ settle: { reject, resolve }, type: "CONNECT" });
    });
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
  send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    // The machine owns the outcome: it gates the send (legality, single-flight)
    // and the wire settles this deferred with the ACK / NAK / timeout / drop.
    // oxlint-disable-next-line promise/avoid-new -- bridge: machine event → caller promise
    return new Promise<MllpClientResponse>((resolve, reject) => {
      // The client boundary: encode to wire bytes + correlation id once, here.
      // Past this point nothing sees a `Root`. Encoding runs inside the executor
      // so a FramingError (an embedded VT/FS byte) rejects this promise instead of
      // throwing synchronously. The parser is lenient, so a tree is always
      // produced (MSH-10 reads as "" for non-HL7v2 text).
      const tree = typeof message === "string" ? parseHL7v2(message) : message;
      const framed = frame(toHl7v2(tree));
      const requestControlId = value(tree, "MSH-10[1].1.1")?.value ?? "";
      const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;
      this.#machine.send({
        framed,
        requestControlId,
        settle: { reject, resolve },
        timeoutMs,
        type: "SEND",
      });
    });
  }

  /**
   * Tear the connection down. Idempotent: resolves from any state and never
   * rejects. An in-flight `send()` rejects with `MllpClientError` (`CLOSED`).
   */
  async close(): Promise<void> {
    // CLOSE stops the wire, whose cleanup rejects an in-flight send and closes
    // the duplex (the wire owns the duplex — the client never closes it). Awaiting
    // the duplex's `closed` signal makes close() resolve once teardown has run,
    // without a second close().
    const { duplex } = this.#machine.getSnapshot().context;
    this.#machine.send({ type: "CLOSE" });
    await duplex?.closed;
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

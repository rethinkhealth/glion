/**
 * The `MllpClient` — a persistent MLLP client for HL7v2.
 *
 * A plain TypeScript implementation: one client owns one connection for its
 * lifetime. The connection lifecycle is a small phase field (`idle → connecting
 * → connected → closed`) plus a single-flight latch; there is no state-machine
 * framework. The per-connection wire — read loop, frame decoder, the response
 * inbox with its pending ACK, drop detection — lives in {@link Connection}
 * (`./connection.ts`), which the client drives directly: `send()` is `await
 * connection.exchange(...)`, a real request/response `Promise`. That direct
 * call is the whole point — a native client owns the connection object, so
 * getting the response back is a method return, not a framework bridge.
 *
 * Single-flight: one send is on the wire at a time; a concurrent `send()`
 * rejects with `ALREADY_SENDING`. (A FIFO queue and connection retry are
 * future work; the default is connect-once, no retry.)
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";

import type { MllpClientResponse } from "./ack";
import { createConnection } from "./connection";
import type { Connection } from "./connection";
import { MllpClientError, MllpErrorCode } from "./errors";
import { prepareOutbound } from "./outbound";

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
 * Opens one connection to the target. **Contract — honour the `signal`:** when
 * it aborts before the connection opens, reject and leave nothing live. The
 * one racy edge — the connection opening in the instant after the abort — is
 * the CLIENT's to dispose (it closes the orphaned duplex itself); the adapter
 * only owes reject-on-abort-before-resolve. The client passes a signal it
 * aborts on `connectTimeoutMs` or `close()`, and trusts this contract.
 */
export type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;

/** The client's connection phase. */
export type MllpClientState = "closed" | "connected" | "connecting" | "idle";

export interface MllpSendOptions {
  /** Overrides the default send deadline (ms): write + ACK wait. */
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
   * remote systems that send unterminated data. The bound is enforced as bytes
   * arrive — it caps `carried-over bytes + one socket read`, so a custom cap
   * must leave room for the largest single chunk the transport can deliver,
   * not just the largest ACK. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_SEND_TIMEOUT_MS = 30_000;

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
  /**
   * True while one send is awaiting its ACK (single-flight). Race-free without
   * locks: it is set synchronously before `send()`'s first `await` and cleared
   * in `finally`, and JavaScript runs one call at a time — concurrent `send()`
   * calls can only interleave at `await` points, by which time the flag is up.
   */
  #inFlight = false;
  /** Aborts the in-flight connect (on `connectTimeoutMs` or `close()`). */
  #connectController: AbortController | null = null;
  /**
   * The in-flight connect attempt while `connecting`; `null` otherwise.
   * Set in the same synchronous step as `#phase = "connecting"`, so the
   * `connecting` phase always has an attempt to join.
   */
  #connecting: Promise<void> | null = null;
  /**
   * Why this client became unusable — the drop, connect failure, or connect
   * timeout (`null` for an owner `close()`, which needs no explanation).
   * Carried on later CLOSED errors so "the remote system hung up" and "the
   * connection never opened" are distinguishable from "the application
   * closed this client".
   */
  #closedReason: MllpClientError | null = null;

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
   * Open the wire through the runtime adapter. Idempotent: while `connecting`
   * it returns the same in-flight attempt — one connection attempt per
   * instance, every caller sees its outcome — and when already `connected` it
   * resolves immediately. A hung connect is bounded by `connectTimeoutMs`;
   * cancel a connecting client with `close()` (every joined caller then
   * rejects with `CONNECT_ABORTED`).
   *
   * @throws {MllpClientError} `CLOSED` when the instance is already `closed`
   *   (construct a new instance); `CONNECT_FAILED` when the adapter rejects
   *   (underlying error on `cause`); `CONNECT_TIMEOUT` when the adapter exceeds
   *   `connectTimeoutMs`; `CONNECT_ABORTED` when `close()` interrupts the
   *   in-flight connect.
   */
  connect(): Promise<void> {
    switch (this.#phase) {
      case "closed": {
        return Promise.reject(MllpClientError.closed(this.#closedReason));
      }
      case "connected": {
        return Promise.resolve();
      }
      case "connecting": {
        // Join the one in-flight attempt; it is set in the same synchronous
        // step as the phase (idle case below). The fallback can only fire on
        // a client bug — reject loudly so it is reported, never masked.
        return (
          this.#connecting ??
          Promise.reject(
            new Error(
              '@glion/mllp-client internal invariant violated: phase is "connecting" with no attempt to join — this is a bug in the client, please report it'
            )
          )
        );
      }
      case "idle": {
        this.#phase = "connecting";
        const attempt = this.#establish();
        this.#connecting = attempt;
        return attempt;
      }
      default: {
        const unhandled: never = this.#phase;
        return Promise.reject(
          new Error(`unhandled client phase: ${String(unhandled)}`)
        );
      }
    }
  }

  /**
   * The one connection attempt, end to end: open the wire through the
   * adapter, then move to `connected` — or to `closed`, throwing the typed
   * reason. Bounded by `connectTimeoutMs` and cancellable by `close()`; both
   * abort the controller with the error to surface, so every failure path
   * lands in the catch already carrying its reason.
   */
  async #establish(): Promise<void> {
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
      // The adapter's contract covers rejecting when aborted BEFORE it
      // resolves. A connection that opens in the instant AFTER the abort is
      // ours to dispose: close it, then let throwIfAborted surface the reason.
      if (controller.signal.aborted) {
        await duplex.close();
        controller.signal.throwIfAborted();
      }
      this.#connection = createConnection({
        duplex,
        host: this.#host,
        maxBufferedBytes: this.#maxBufferedBytes,
        onDrop: (error) => this.#handleDrop(error),
        // FIXME(https://github.com/rethinkhealth/glion/issues/685): the client
        // hard-wires @glion/parser for inbound ACK parsing; the parser should
        // be an application choice, as on the server (`Mllp.parser()`).
        parser: parseHL7v2,
        port: this.#port,
      });
      this.#phase = "connected";
    } catch (error) {
      this.#phase = "closed";
      // Only this client aborts the controller, always with the typed reason —
      // CONNECT_TIMEOUT from the deadline, CONNECT_ABORTED from close().
      const reason: unknown = controller.signal.reason;
      if (controller.signal.aborted && reason instanceof MllpClientError) {
        // CONNECT_ABORTED came from an owner close() — like close() itself,
        // it records no reason; a timeout is not the owner's doing.
        if (reason.code === MllpErrorCode.CONNECT_TIMEOUT) {
          this.#closedReason = reason;
        }
        throw reason;
      }
      const failure = MllpClientError.connectionFailure(error);
      this.#closedReason = failure;
      throw failure;
    } finally {
      clearTimeout(timer);
      this.#connectController = null;
      this.#connecting = null;
    }
  }

  /**
   * Parse and send `message`, then resolve with the parsed ACK. One send is on
   * the wire at a time; a concurrent send while one is in flight rejects with
   * `ALREADY_SENDING`. There is no caller cancellation signal — a send is
   * bounded by its send deadline (covering the write and the ACK wait), and
   * `close()` rejects an in-flight send. A timed-out send closes the
   * connection: a late acknowledgment could never be matched safely.
   *
   * @throws {AckException} (from `@glion/ack`) The remote system returned a
   *   NAK.
   * @throws {MllpClientError} Otherwise; branch on `code`: `NOT_CONNECTED` /
   *   `CLOSED` (state guard), `ALREADY_SENDING` (a send is already on the
   *   wire), `INVALID_MESSAGE` (no MSH-10 control ID, or a reserved MLLP
   *   character VT/FS in the serialized text — nothing was sent; CR is
   *   allowed as the segment terminator), `SEND_TIMEOUT` (no ACK within the
   *   deadline — the connection closes; the message's fate is unknown),
   *   `DROPPED` (terminal), `INVALID_RESPONSE` (the remote system's reply was
   *   not a usable acknowledgment — see its `message`; the connection closes,
   *   because acknowledgment correlation can no longer be trusted).
   */
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    switch (this.#phase) {
      case "idle":
      case "connecting": {
        throw MllpClientError.notConnected();
      }
      case "closed": {
        throw MllpClientError.closed(this.#closedReason);
      }
      case "connected": {
        break;
      }
      default: {
        const unhandled: never = this.#phase;
        throw new Error(`unhandled client phase: ${String(unhandled)}`);
      }
    }
    if (this.#inFlight) {
      throw MllpClientError.alreadySending();
    }
    const connection = this.#connection;
    if (connection === null) {
      throw new Error(
        '@glion/mllp-client internal invariant violated: phase is "connected" with no live connection — this is a bug in the client, please report it'
      );
    }

    this.#inFlight = true;
    try {
      // The outbound boundary (./outbound): parse → serialize → encode →
      // frame → correlate, throwing with nothing written. See prepareOutbound.
      const { framed, requestControlId } = prepareOutbound(message, parseHL7v2);
      // `return await`, deliberately: the finally below must release the
      // single-flight latch when the exchange SETTLES, not when the promise
      // is created — a bare return would clear #inFlight while the send is
      // still on the wire.
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
   * rejects. An in-flight `send()` rejects with `MllpClientError` —
   * `CLOSED` while waiting for the ACK, or `DROPPED` when the close lands
   * mid-write.
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
          "The connection was closed before this message's acknowledgment arrived."
        )
      );
    }
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * The connection reported that the remote system ended it. With no retry,
   * that is terminal: `connection.ts` has already rejected any in-flight send
   * with `DROPPED`; the client records the closed phase and the reason —
   * surfaced as the `cause` of later CLOSED errors — and releases the wire.
   */
  #handleDrop(error: MllpClientError): void {
    this.#phase = "closed";
    this.#connection = null;
    this.#closedReason = error;
  }
}

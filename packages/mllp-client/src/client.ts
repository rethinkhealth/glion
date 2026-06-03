/**
 * The `MllpClient` — a persistent MLLP client for HL7v2.
 *
 * One client owns one connection lifecycle. The lifecycle itself is a state
 * machine (./state.ts); the client drives it with events (CONNECT / CONNECTED /
 * DROP / CLOSE) and trusts its transition table — it never reads the phase to
 * decide *whether* to send an event. The per-connection wire (read loop, ACK
 * exchange, teardown) is a {@link Connection} (./connection.ts); the HL7v2
 * codec is ./message.ts.
 *
 * Single-flight: one send is on the wire at a time. A FIFO send queue is NOT
 * wired yet (./queue.ts is kept but unused) — a concurrent `send()` while one
 * is in flight rejects with `SEND_IN_PROGRESS` until the queue is restored.
 *
 * @module
 */

import { createConnection } from "./connection";
import type { Connection } from "./connection";
import type { MllpConnector, MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode } from "./errors";
import { requestControlId, toTree, toWireBytes } from "./message";
import type { MllpClientResponse, SendInput } from "./message";
import { createConnectionState, NO_RECONNECT } from "./state";
import type { ConnectionPhase } from "./state";

export type { MllpDuplex, MllpConnector } from "./duplex";
export type { MllpClientResponse, SendInput } from "./message";

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
  readonly #connect: MllpConnector;
  readonly #connectTimeoutMs: number;
  readonly #sendTimeoutMs: number;
  readonly #maxBufferedBytes: number | undefined;

  /** The connection lifecycle — the single source of truth for `state`. */
  readonly #machine = createConnectionState(NO_RECONNECT);
  /** The live wire while `connected`; `null` otherwise. */
  #connection: Connection | null = null;
  /** Single-flight guard until the FIFO queue is wired. */
  #inFlight = false;

  constructor(opts: MllpClientOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#connect = opts.connect;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#maxBufferedBytes = opts.maxBufferedBytes;

    // Disposition reacts to the machine reaching "closed" (a drop, an explicit
    // close, or a failed connect): release the connection. The in-flight send,
    // if any, is settled by the connection (on a drop) or by close()'s shutdown.
    this.#machine.subscribe((snapshot) => {
      if (snapshot.value === "closed") {
        this.#connection = null;
      }
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
    return this.#machine.getSnapshot().value;
  }

  /** True while the wire is up (state is `connected`). */
  get connected(): boolean {
    return this.state === "connected";
  }

  /**
   * Open the wire through the runtime adapter. Single-shot: each instance
   * manages one connection lifecycle. A hung dial is bounded by
   * `connectTimeoutMs`; cancel a connecting client with `close()`.
   *
   * @throws {MllpClientError} `CLOSED` when the instance is already `closed`
   *   (construct a new instance); `ALREADY_CONNECTED` when called while
   *   `connecting`/`connected`; `CONNECT_FAILED` when the adapter rejects
   *   (underlying error on `cause`); `CONNECT_TIMEOUT` when the adapter exceeds
   *   `connectTimeoutMs` (`timeoutMs` set); `CONNECT_ABORTED` when `close()`
   *   interrupts an in-flight connect.
   */
  async connect(): Promise<void> {
    // Ask the machine whether CONNECT is legal — its transition table is the
    // authority (only `idle` accepts CONNECT). The phase is read only to phrase
    // the error, never to make the decision.
    const snapshot = this.#machine.getSnapshot();
    if (!snapshot.can({ type: "CONNECT" })) {
      throw snapshot.value === "closed"
        ? new MllpClientError(
            MllpErrorCode.CLOSED,
            "Cannot connect: this client has been closed. Construct a new MllpClient to open a fresh connection."
          )
        : new MllpClientError(
            MllpErrorCode.ALREADY_CONNECTED,
            `Cannot connect while ${snapshot.value}: an MllpClient opens one connection in its lifetime. Await the in-flight connect, or use a separate client for a concurrent connection.`
          );
    }
    this.#machine.send({ type: "CONNECT" });

    const timeoutSignal = AbortSignal.timeout(this.#connectTimeoutMs);
    let duplex: MllpDuplex;
    try {
      duplex = await this.#connect({
        host: this.#host,
        port: this.#port,
        signal: timeoutSignal,
      });
    } catch (error) {
      // Report the failure and trust the machine: it fails fast "connecting" →
      // "closed" (no reconnect on the initial connect) and ignores the event if
      // a concurrent close() already closed it.
      this.#machine.send({ error, type: "CONNECT_FAILED" });
      if (timeoutSignal.aborted) {
        throw new MllpClientError(
          MllpErrorCode.CONNECT_TIMEOUT,
          `Connect to ${this.#host}:${this.#port} timed out after ${this.#connectTimeoutMs}ms.`,
          { timeoutMs: this.#connectTimeoutMs }
        );
      }
      throw new MllpClientError(
        MllpErrorCode.CONNECT_FAILED,
        `Failed to connect to ${this.#host}:${this.#port}: the runtime adapter rejected the connection (see the error's cause).`,
        { cause: error }
      );
    }

    // The dial succeeded — try to commit. The `await` above is a yield point, so
    // a concurrent close() may have run (CLOSE → "closed"). Send CONNECTED and
    // let the machine arbitrate: if it accepts (→ "connected") we own the wire;
    // if close() already closed it, CONNECTED is ignored and we own an orphaned,
    // open duplex — close it to avoid a leak, then surface CONNECT_ABORTED.
    this.#machine.send({ type: "CONNECTED" });
    if (this.#machine.getSnapshot().value !== "connected") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        `Connect to ${this.#host}:${this.#port} was interrupted: close() was called while the connection was still being established.`
      );
    }

    this.#connection = createConnection({
      duplex,
      host: this.#host,
      maxBufferedBytes: this.#maxBufferedBytes,
      onDrop: (error) => {
        this.#machine.send({ error, type: "DROP" });
      },
      port: this.#port,
    });
  }

  /**
   * Parse and send `message`, then resolve with the parsed ACK. One send is on
   * the wire at a time; a concurrent send while one is in flight rejects with
   * `SEND_IN_PROGRESS` (the FIFO queue is not wired yet). There is no caller
   * cancellation signal — a send is bounded by its ACK deadline, and `close()`
   * rejects an in-flight send.
   *
   * @throws {AckException} (from `@glion/ack`) The peer returned a NAK.
   * @throws {MllpClientError} Otherwise; branch on `code`: `NOT_CONNECTED` /
   *   `CLOSED` (state guard), `SEND_IN_PROGRESS` (a send is already on the
   *   wire), `SEND_TIMEOUT`, `DROPPED` (terminal), `CORRELATION_MISMATCH`,
   *   `PARSE_FAILED`, `UNKNOWN_ACK_CODE`.
   * @throws {FramingError} The message carries an embedded MLLP framing byte
   *   (VT or FS) that cannot be framed. CR is allowed (segment terminator).
   */
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    if (this.state === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        "Cannot send: this client is closed. Construct a new MllpClient to send again."
      );
    }
    const conn = this.#connection;
    if (conn === null || this.state !== "connected") {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${this.state}, not connected. Call connect() before send().`
      );
    }
    if (this.#inFlight) {
      throw new MllpClientError(
        MllpErrorCode.SEND_IN_PROGRESS,
        "Cannot send: another send is already on the wire. This client is single-flight and does not queue concurrent sends yet; await the in-flight send first."
      );
    }

    // The client boundary: a `string` is parsed to a tree once, here. Past this
    // point everything works on a `Root`.
    const tree = toTree(message);
    this.#inFlight = true;
    try {
      return await conn.exchange({
        framed: toWireBytes(tree),
        requestControlId: requestControlId(tree),
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
    // Capture the live connection before CLOSE: reaching "closed" runs the
    // disposition subscription synchronously, which releases the reference.
    // CLOSE is idempotent — the machine ignores it once closed.
    const conn = this.#connection;
    this.#machine.send({ type: "CLOSE" });
    if (conn) {
      await conn.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have reached the peer; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    }
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

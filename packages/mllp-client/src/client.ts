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

import { createFrameDecoder } from "@glion/mllp-transport";

import { MllpClientError, MllpErrorCode, sendTimeoutError } from "./errors";
import {
  parseResponse,
  requestControlId,
  toTree,
  toWireBytes,
} from "./message";
import type { MllpClientResponse, SendInput } from "./message";
import { createConnectionState } from "./state";
import type { ConnectionPhase } from "./state";
import { NO_RECONNECT } from "./util/reconnect";

export type { MllpClientResponse, SendInput } from "./message";

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

// ── Per-connection wire ──────────────────────────────────────────────────────
//
// One MllpDuplex maps to one Connection. It owns everything whose correct
// lifetime is a single connection: the FrameDecoder (whose byte buffer survives
// across SENDS within this connection — that is what lets a late ACK after a
// timeout land on the next send — but must NEVER survive across connections),
// the read loop, peer-drop detection, the single-flight wire exchange, and the
// unsolicited-frame buffer. A fresh object per dial makes "reset connection-
// scoped state on reconnect" a structural guarantee rather than a discipline.

/**
 * Maximum unsolicited frames buffered between sends; a flood beyond this is
 * terminal.
 */
const MAX_PENDING_FRAMES = 16;

interface FrameWaiter {
  resolve(bytes: Uint8Array): void;
  reject(error: Error): void;
}

interface ExchangeRequest {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  /** ACK-wait deadline (ms); `exchange` owns the timer, scoped to one exchange. */
  readonly timeoutMs: number;
}

interface Connection {
  /**
   * Write `req` and resolve with the parsed ACK. Single-flight — never call
   * concurrently.
   */
  exchange(req: ExchangeRequest): Promise<MllpClientResponse>;
  /**
   * Owner-initiated teardown: settle the in-flight send with `reason`, close
   * the duplex.
   */
  shutdown(reason: MllpClientError): Promise<void>;
}

interface ConnectionOptions {
  readonly duplex: MllpDuplex;
  readonly host: string;
  readonly port: number;
  readonly maxBufferedBytes: number | undefined;
  /**
   * Fired once when the PEER ends the connection (not on owner-initiated
   * shutdown).
   */
  onDrop(error: MllpClientError): void;
}

function createConnection(opts: ConnectionOptions): Connection {
  const { duplex, host, port, maxBufferedBytes, onDrop } = opts;

  const decoder = createFrameDecoder(
    maxBufferedBytes === undefined ? undefined : { maxBufferedBytes }
  );
  const reader = duplex.readable.getReader();

  let pendingFrames: Uint8Array[] = [];
  let frameWaiter: FrameWaiter | null = null;
  // Race recovery: a drop can land between writer.write() and the exchange
  // registering its waiter. Stash the error so the imminent waitForFrame surfaces
  // it instead of hanging.
  let pendingError: MllpClientError | null = null;
  // Terminal latch: set by the first drop OR by shutdown — teardown + onDrop run
  // at most once.
  let dead = false;
  let closingExplicit = false;

  function dispatchError(error: MllpClientError): void {
    if (dead) {
      return;
    }
    dead = true;
    const waiter = frameWaiter;
    frameWaiter = null;
    pendingFrames = [];
    // Fire-and-forget — the adapter contract guarantees close() resolves.
    void duplex.close();
    // onDrop first (machine transition), then the on-wire waiter, so a caller
    // observing the lifecycle and the send rejection sees consistent state.
    onDrop(error);
    if (waiter) {
      waiter.reject(error);
    } else {
      pendingError = error;
    }
  }

  function dispatchFrame(bytes: Uint8Array): void {
    const waiter = frameWaiter;
    if (waiter) {
      frameWaiter = null;
      waiter.resolve(bytes);
      return;
    }
    if (pendingFrames.length >= MAX_PENDING_FRAMES) {
      dispatchError(
        new MllpClientError(
          MllpErrorCode.DROPPED,
          `The peer sent more than ${MAX_PENDING_FRAMES} unsolicited frames with no matching request; closing the connection to avoid unbounded buffering.`,
          { reason: "frame-queue-overflow" }
        )
      );
      return;
    }
    pendingFrames.push(bytes);
  }

  async function runReadLoop(): Promise<void> {
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (dead) {
          return;
        }
        if (done) {
          // The peer half-closed; watchForDrop reports the drop. Just exit.
          return;
        }
        const error = decoder.push(chunk, (decoded) => dispatchFrame(decoded));
        if (error) {
          // Decoder errors are terminal (its buffer state becomes undefined).
          dispatchError(
            new MllpClientError(MllpErrorCode.DROPPED, error.message, {
              cause: error,
              reason: "framing-error",
            })
          );
          return;
        }
      }
    } catch {
      // reader.read() rejected — shutdown released the lock, or the stream
      // errored. watchForDrop or shutdown owns teardown; nothing to do.
    }
  }

  async function watchForDrop(): Promise<void> {
    await duplex.closed;
    if (closingExplicit || dead) {
      return;
    }
    dispatchError(
      new MllpClientError(
        MllpErrorCode.DROPPED,
        `The peer at ${host}:${port} closed the connection.`,
        { reason: "peer-drop" }
      )
    );
  }

  function waitForFrame(
    deadlineSignal: AbortSignal,
    timeoutMs: number
  ): Promise<Uint8Array> {
    // A drop fired between writer.write() and this registration — surface it.
    if (pendingError !== null) {
      const error = pendingError;
      pendingError = null;
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- error is a narrowed MllpClientError
      return Promise.reject(error);
    }
    // Drain a previously-queued (late) frame first.
    const queued = pendingFrames.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    // oxlint-disable-next-line promise/avoid-new -- canonical waiter wrapper
    return new Promise<Uint8Array>((resolve, reject) => {
      const onTimeout = () => {
        if (frameWaiter === waiter) {
          frameWaiter = null;
        }
        reject(sendTimeoutError(timeoutMs));
      };

      const waiter: FrameWaiter = {
        reject: (error) => {
          deadlineSignal.removeEventListener("abort", onTimeout);
          reject(error);
        },
        resolve: (bytes) => {
          deadlineSignal.removeEventListener("abort", onTimeout);
          resolve(bytes);
        },
      };

      frameWaiter = waiter;
      if (deadlineSignal.aborted) {
        onTimeout();
        return;
      }
      deadlineSignal.addEventListener("abort", onTimeout, { once: true });
    });
  }

  async function exchange(req: ExchangeRequest): Promise<MllpClientResponse> {
    const sentMonotonic = performance.now();

    const writer = duplex.writable.getWriter();
    try {
      await writer.write(req.framed);
    } catch (error) {
      // Write failure is terminal — the socket half is dead.
      const dropped = new MllpClientError(
        MllpErrorCode.DROPPED,
        `Failed to write the framed message to ${host}:${port}; the connection is no longer usable (see the error's cause).`,
        { cause: error, reason: "write-failed" }
      );
      dispatchError(dropped);
      throw dropped;
    } finally {
      writer.releaseLock();
    }

    // The ACK-wait deadline is owned here, scoped to this exchange: started now,
    // cleared in `finally` the moment it settles. AbortController + setTimeout
    // (not AbortSignal.timeout) so the timer is cancellable and never lingers.
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => {
      deadline.abort();
    }, req.timeoutMs);
    try {
      const ackBytes = await waitForFrame(deadline.signal, req.timeoutMs);
      const timestamp = new Date();
      const durationMs = performance.now() - sentMonotonic;
      return parseResponse({
        durationMs,
        raw: ackBytes,
        requestControlId: req.requestControlId,
        timestamp,
      });
    } catch (error) {
      // Slowloris recovery: on a send timeout with a mid-frame decoder buffer,
      // reset it so the next send isn't corrupted by the partial.
      if (
        error instanceof MllpClientError &&
        error.code === MllpErrorCode.SEND_TIMEOUT &&
        !dead &&
        decoder.buffered > 0
      ) {
        decoder.reset();
      }
      throw error;
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  async function shutdown(reason: MllpClientError): Promise<void> {
    if (dead) {
      // A peer drop already tore this connection down; nothing left to settle.
      return;
    }
    closingExplicit = true;
    dead = true;
    const waiter = frameWaiter;
    if (waiter) {
      frameWaiter = null;
      waiter.reject(reason);
    } else {
      pendingError = reason;
    }
    pendingFrames = [];
    try {
      reader.releaseLock();
    } catch {
      // The read loop may have already released or rejected — fine.
    }
    await duplex.close();
  }

  void runReadLoop();
  void watchForDrop();

  return { exchange, shutdown };
}

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
      this.#machine.send({ type: "CONNECT_FAILED" });
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
      onDrop: () => {
        this.#machine.send({ type: "DROP" });
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

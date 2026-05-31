/**
 * The `MllpClient` class — persistent MLLP client for HL7v2. One send is on the
 * wire at a time; concurrent sends queue (FIFO) and run one after another.
 *
 * @module
 */

import { createActor } from "xstate";
import type { Actor } from "xstate";

import { createConnection } from "./connection";
import type { Connection } from "./connection";
import type { MllpConnector, MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode, sendAbortError } from "./errors";
import { readRequestControlId, toWireFrame } from "./hl7v2";
import type { MllpClientResponse, SendInput } from "./hl7v2";
import { NO_RECONNECT } from "./reconnect";
import { connectionMachine } from "./state";
import type { ConnectionPhase } from "./state";

export type MllpClientState =
  | "idle"
  | "connecting"
  | "ready"
  | "sending"
  | "closing"
  | "closed";

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
   * Maximum bytes buffered while decoding inbound ACK frames. Defence
   * against peers that send unterminated data. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

export interface MllpSendOptions {
  /** Caller-provided cancellation signal. */
  readonly signal?: AbortSignal;
  /** Override the client's default send timeout for this call. */
  readonly timeoutMs?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_SEND_TIMEOUT_MS = 30_000;

/**
 * A send awaiting its turn on the wire. The client serializes sends: one
 * runs at a time, the rest wait here in FIFO order. The per-send deadline
 * starts when `send()` is called, so it spans the queue wait as well as the
 * write and the ACK wait — a queued send can time out or be aborted before
 * it is ever written. The wire bytes are framed up front (see
 * {@link toWireFrame}); the queue just transports them.
 */
interface QueuedSend {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  readonly timeoutMs: number;
  /**
   * Combined deadline + caller signal; drives abort both while queued and on
   * the wire.
   */
  readonly abortSignal: AbortSignal;
  /**
   * The deadline half of {@link abortSignal}; lets a waiter tell timeout from
   * caller-abort.
   */
  readonly deadlineSignal: AbortSignal;
  resolve(response: MllpClientResponse): void;
  reject(error: Error): void;
  /** Stop the deadline timer. Idempotent. */
  clearDeadline(): void;
  /**
   * Detach the while-queued abort listener (called when the send goes on the
   * wire).
   */
  detachQueuedAbort(): void;
}

export class MllpClient {
  readonly #host: string;
  readonly #port: number;
  readonly #connect: MllpConnector;
  readonly #connectTimeoutMs: number;
  readonly #sendTimeoutMs: number;
  readonly #maxBufferedBytes: number | undefined;

  // The connection lifecycle is owned by the state machine (see ./state.ts):
  // its state answers idle/connecting/connected/closed. Two wire-layer facts
  // the machine deliberately does not model are tracked here so `state` can
  // report the public `sending`/`closing` phases: whether a send is on the
  // wire, and whether close()'s async teardown is in progress.
  readonly #machine: Actor<typeof connectionMachine>;
  #onWire = false;
  #closing = false;

  // The live wire, once connected. The connection owns all per-connection state
  // (decoder, reader, frame buffer, the single-flight exchange) and its own
  // teardown — see ./connection.ts. Null when not connected.
  #connection: Connection | null = null;

  // Sends waiting for the wire (FIFO). The one currently on the wire has
  // been shifted out, so #queue holds only the not-yet-dispatched sends —
  // which is what #queueDepth reports. #draining guards the drain loop so
  // only one runs at a time.
  #queue: QueuedSend[] = [];
  #draining = false;

  constructor(opts: MllpClientOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#connect = opts.connect;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#maxBufferedBytes = opts.maxBufferedBytes;
    // Reconnect is disabled for now, so a drop goes straight to `closed` — the
    // client's existing behaviour. Enabling reconnect is a follow-up that wires
    // the machine's backingOff/reconnecting states to a redial.
    this.#machine = createActor(connectionMachine, {
      input: { policy: NO_RECONNECT },
    });
    this.#machine.start();
  }

  /** The current connection-machine state value. */
  #phase(): ConnectionPhase {
    return this.#machine.getSnapshot().value;
  }

  /** True when the wire is up (the machine is in `connected`). */
  #isConnected(): boolean {
    return this.#phase() === "connected";
  }

  /** Target host the client is configured for. Useful in error logs. */
  get host(): string {
    return this.#host;
  }

  /** Target port the client is configured for. Useful in error logs. */
  get port(): number {
    return this.#port;
  }

  get state(): MllpClientState {
    // close()'s async teardown reports as "closing" even though the machine has
    // already advanced to "closed" synchronously on CLOSE.
    if (this.#closing) {
      return "closing";
    }
    const phase = this.#phase();
    if (phase === "connected") {
      return this.#onWire ? "sending" : "ready";
    }
    if (phase === "idle") {
      return "idle";
    }
    if (phase === "closed") {
      return "closed";
    }
    // connecting, plus the (currently unreachable) reconnect phases.
    return "connecting";
  }

  /** True when ready or sending — i.e., the wire is up. */
  get connected(): boolean {
    return this.#isConnected();
  }

  /**
   * Number of sends waiting in the queue, excluding the one currently on the
   * wire. Fire three concurrent sends on a ready client and this reads `2`.
   */
  get queueDepth(): number {
    return this.#queue.length;
  }

  /**
   * Open the wire through the runtime adapter and start the read loop.
   * Single-shot: each instance manages one connection lifecycle.
   *
   * @param opts.signal - Cancels an in-flight connect.
   * @throws {MllpClientError} `CLOSED` when the instance is already
   *   `closed`/`closing` (construct a new instance); `ALREADY_CONNECTED` when
   *   called while `connecting`/`ready`/`sending`; `CONNECT_ABORTED` when
   *   `opts.signal` aborts or `close()` interrupts the connect.
   *   `CONNECT_FAILED` when the adapter rejects (underlying error on `cause`);
   *   `CONNECT_TIMEOUT` when the adapter exceeds `connectTimeoutMs`
   *   (`timeoutMs` set).
   */
  async connect(opts: { signal?: AbortSignal } = {}): Promise<void> {
    const phase = this.#phase();
    if (phase === "closed" || this.#closing) {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot connect: this client is ${this.state} — it has been closed. Construct a new MllpClient to open a fresh connection.`
      );
    }
    if (phase !== "idle") {
      throw new MllpClientError(
        MllpErrorCode.ALREADY_CONNECTED,
        `Cannot connect while ${this.state}: an MllpClient opens one connection in its lifetime. Await the in-flight connect, or use a separate client for a concurrent connection.`
      );
    }
    this.#machine.send({ type: "CONNECT" });

    const timeoutSignal = AbortSignal.timeout(this.#connectTimeoutMs);
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal;

    let duplex: MllpDuplex;
    try {
      duplex = await this.#connect({
        host: this.#host,
        port: this.#port,
        signal,
      });
    } catch (error) {
      // Fails fast to "closed" (no reconnect on the initial connect). Guard the
      // send: a concurrent close() may have already taken the machine to
      // "closed", where the event is a no-op.
      if (this.#phase() === "connecting") {
        this.#machine.send({ error, type: "CONNECT_FAILED" });
      }
      if (opts.signal?.aborted) {
        throw new MllpClientError(
          MllpErrorCode.CONNECT_ABORTED,
          `Connect to ${this.#host}:${this.#port} was aborted by the caller's abort signal.`,
          { cause: error }
        );
      }
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

    // Close-during-connect race. We sent CONNECT (→ "connecting") before the
    // `await` above; an `await` is a yield point, so a concurrent close() can
    // run while we are suspended. Re-check that invariant rather than test for
    // one specific state: anything other than "connecting" means we were
    // superseded (close() sends CLOSE → "closed"). Because close() ran while
    // #duplex was still null (it is assigned just below — the commit point), it
    // could not have torn down the socket the adapter just returned. We now own
    // that orphaned, open duplex: close it to avoid a leak, then surface
    // CONNECT_ABORTED.
    if (this.#phase() !== "connecting") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        `Connect to ${this.#host}:${this.#port} was interrupted: close() was called while the connection was still being established.`
      );
    }

    // Advance the machine to "connected" BEFORE creating the connection, so a
    // drop reported by the connection's read loop lands while the machine can
    // handle DROP. (The loops are async and yield before acting, so #connection
    // is assigned and the machine is connected before either can fire.)
    this.#machine.send({ type: "CONNECTED" });
    this.#connection = createConnection({
      duplex,
      host: this.#host,
      maxBufferedBytes: this.#maxBufferedBytes,
      onDrop: (error) => this.#onConnectionDrop(error),
      port: this.#port,
    });
  }

  /**
   * The peer ended the live connection (drop, framing error, unsolicited-frame
   * flood, or a failed write). The connection has already settled its own
   * in-flight send and torn itself down; here we advance the machine and
   * dispose of the queue. With reconnect disabled the `DROP` drives the machine
   * to `closed`, so queued sends — which never reached the wire — fail
   * `CLOSED`.
   */
  #onConnectionDrop(error: Error): void {
    if (!this.#isConnected()) {
      return;
    }
    this.#machine.send({ error, type: "DROP" });
    this.#connection = null;
    this.#failQueue(
      "The connection ended before this queued send reached the wire; it was not transmitted."
    );
  }

  /**
   * Frame and enqueue `message`, then resolve with the parsed ACK. Concurrent
   * sends queue (FIFO) and run one at a time.
   *
   * @param opts.signal - Cancels the send; may abort while it is still queued.
   * @param opts.timeoutMs - Overrides the default deadline (it spans the queue
   *   wait as well as the wire round-trip).
   * @throws {AckException} (from `@glion/ack`) The peer returned a NAK — the
   *   subclass encodes the code: `AckApplicationError`/`AckApplicationReject`/
   *   `AckCommitError`/`AckCommitReject` for AE/AR/CE/CR.
   * @throws {MllpClientError} Otherwise; branch on `code`: `CORRELATION_MISMATCH`
   *   (request MSH-10 and response MSA-2 both non-empty and differ),
   *   `SEND_TIMEOUT` (no ACK in time), `DROPPED` (connection ended; `reason`
   *   discriminates — terminal), `SEND_ABORTED` (`opts.signal` aborted),
   *   `NOT_CONNECTED`/`CLOSED` (state guard), `PARSE_FAILED`/`UNKNOWN_ACK_CODE`
   *   (ACK unparseable or non-standard MSA-1). Reading the request's MSH-10 is
   *   best-effort and never throws.
   * @throws {FramingError} The message carries an embedded MLLP framing byte
   *   (VT or FS) that cannot be framed. CR is allowed (segment terminator).
   */
  // `async` keeps the Promise contract: the synchronous guard and toWireFrame()
  // failures below surface as rejections, never as synchronous throws — which
  // is what callers (and the tests) rely on. No `await` is needed in the body.
  // oxlint-disable-next-line eslint/require-await
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    if (this.#closing || this.#phase() === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot send: this client is ${this.state} — it has been closed. Construct a new MllpClient to send again.`
      );
    }
    if (!this.#isConnected()) {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${this.state}, not connected. Call connect() before send().`
      );
    }

    // Build the wire bytes (caller bytes verbatim, or a serialized Root) and
    // read MSH-10 for correlation before enqueuing. Framing an unframable
    // payload rejects here, before it occupies a queue slot; reading MSH-10 is
    // best-effort and never blocks the send.
    const framed = toWireFrame(message);
    const requestControlId = readRequestControlId(message);
    const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;

    return this.#enqueue(framed, requestControlId, timeoutMs, opts.signal);
  }

  /**
   * Wrap a send in a {@link QueuedSend}, start its deadline, and hand it to
   * the drain loop. The deadline starts here so it covers the time spent
   * waiting in the queue. `AbortController` + `setTimeout` (not
   * `AbortSignal.timeout`) so the timer is cancellable on settle and never
   * lingers.
   */
  #enqueue(
    framed: Uint8Array,
    requestControlId: string,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined
  ): Promise<MllpClientResponse> {
    // oxlint-disable-next-line promise/avoid-new -- queued-send deferred wrapper
    return new Promise<MllpClientResponse>((resolve, reject) => {
      const deadlineController = new AbortController();
      const deadlineTimer = setTimeout(() => {
        deadlineController.abort();
      }, timeoutMs);
      const deadlineSignal = deadlineController.signal;
      const abortSignal = callerSignal
        ? AbortSignal.any([deadlineSignal, callerSignal])
        : deadlineSignal;

      // clearTimeout is a no-op on an already-fired or already-cleared timer,
      // so this is safe to call from any settle path.
      const clearDeadline = () => {
        clearTimeout(deadlineTimer);
      };

      const onQueuedAbort = () => {
        // Abort while still queued: drop from the queue and reject. Once on
        // the wire this listener is detached and #waitForFrame owns abort.
        const index = this.#queue.indexOf(task);
        if (index !== -1) {
          this.#queue.splice(index, 1);
        }
        clearDeadline();
        reject(sendAbortError(deadlineSignal, timeoutMs));
      };
      const detachQueuedAbort = () => {
        abortSignal.removeEventListener("abort", onQueuedAbort);
      };

      const task: QueuedSend = {
        abortSignal,
        clearDeadline,
        deadlineSignal,
        detachQueuedAbort,
        framed,
        reject,
        requestControlId,
        resolve,
        timeoutMs,
      };

      if (abortSignal.aborted) {
        // Caller signal was already aborted before we could queue.
        clearDeadline();
        reject(sendAbortError(deadlineSignal, timeoutMs));
        return;
      }
      abortSignal.addEventListener("abort", onQueuedAbort, { once: true });
      this.#queue.push(task);
      this.#drain();
    });
  }

  /** Kick the drain loop if it isn't already running and the wire is ready. */
  #drain(): void {
    // Only one drain loop runs at a time; it runs only while the wire is up and
    // idle (connected with no send on the wire — when a send is on the wire the
    // loop is already active, so #draining is set).
    if (this.#draining || !this.#isConnected()) {
      return;
    }
    this.#draining = true;
    void this.#runQueue();
  }

  /**
   * Process queued sends one at a time while the wire is ready. A drop or
   * close during a send advances state out of "ready" and fails the rest of
   * the queue, so the loop exits cleanly.
   */
  async #runQueue(): Promise<void> {
    try {
      while (this.#queue.length > 0 && this.#isConnected()) {
        const conn = this.#connection;
        if (conn === null) {
          return;
        }
        const task = this.#queue.shift();
        if (task === undefined) {
          return;
        }
        task.detachQueuedAbort();
        this.#onWire = true;
        try {
          const result = await conn.exchange(task);
          task.clearDeadline();
          task.resolve(result);
        } catch (error) {
          task.clearDeadline();
          task.reject(error as Error);
        } finally {
          this.#onWire = false;
        }
        // A drop or close during the send advanced the machine out of
        // "connected" (and failed the rest of the queue), so the loop condition
        // exits. Otherwise the wire is still up and the next send proceeds.
      }
    } finally {
      this.#draining = false;
    }
  }

  /**
   * Reject every still-queued send (those not yet on the wire). The on-wire
   * send, if any, is rejected separately by the connection. Called when the
   * connection ends: a queued send was never dispatched, so it fails with
   * `CLOSED` rather than `DROPPED` (which means "ended while awaiting an ACK").
   */
  #failQueue(message: string): void {
    if (this.#queue.length === 0) {
      return;
    }
    const tasks = this.#queue.splice(0);
    for (const task of tasks) {
      task.detachQueuedAbort();
      task.clearDeadline();
      task.reject(new MllpClientError(MllpErrorCode.CLOSED, message));
    }
  }

  /**
   * Tear the connection down. Idempotent: resolves from any state and never
   * rejects. The in-flight `send()` rejects with `MllpClientError` (`CLOSED`),
   * as does every queued send.
   */
  async close(): Promise<void> {
    if (this.#phase() === "closed" || this.#closing) {
      return;
    }
    if (this.#phase() === "idle") {
      this.#machine.send({ type: "CLOSE" });
      return;
    }

    // The machine advances to "closed" synchronously here; #closing keeps the
    // public state at "closing" until the async teardown below completes.
    this.#closing = true;
    this.#machine.send({ type: "CLOSE" });

    // Reject every queued send — none of them will reach the wire.
    this.#failQueue("Client closed before this queued send was dispatched");

    // Hand teardown of the live wire to the connection: it settles the in-flight
    // send with CLOSED (the caller initiated this) and closes the duplex.
    const conn = this.#connection;
    this.#connection = null;
    if (conn) {
      await conn.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have reached the peer; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    }
    this.#closing = false;
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

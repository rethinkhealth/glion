/**
 * `createConnectionManager` — the orchestrator behind {@link MllpClient}.
 *
 * Owns the connection state machine (./state.ts), the FIFO send queue + single
 * drain loop, the dial routine, and the disposition of queued / in-flight sends
 * across the connection lifecycle. It creates a fresh {@link Connection}
 * (./connection.ts) per dial and projects the machine's phase onto the public
 * {@link MllpClientState}.
 *
 * Functional-over-class (CLAUDE.md §4): the manager is a factory + closures;
 * the public `MllpClient` class is a thin facade over it. The instance-scoped
 * concerns live here; one connection's mortal wire state lives in the
 * `Connection` this manager creates.
 *
 * @module
 */

import { createActor } from "xstate";

import { createConnection } from "./connection";
import type { Connection } from "./connection";
import type { MllpConnector, MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode, sendAbortError } from "./errors";
import { readRequestControlId, toWireFrame } from "./hl7v2";
import type { MllpClientResponse, SendInput } from "./hl7v2";
import type { ReconnectPolicy } from "./reconnect";
import { connectionMachine } from "./state";

/** The public connection state reported by {@link ConnectionManager.state}. */
export type MllpClientState =
  | "idle"
  | "connecting"
  | "ready"
  | "sending"
  | "closing"
  | "closed";

export interface MllpSendOptions {
  /** Caller-provided cancellation signal. */
  readonly signal?: AbortSignal;
  /** Override the client's default send timeout for this call. */
  readonly timeoutMs?: number;
}

/** Resolved configuration the manager runs on (defaults already applied). */
export interface ManagerOptions {
  readonly host: string;
  readonly port: number;
  readonly connect: MllpConnector;
  readonly connectTimeoutMs: number;
  readonly sendTimeoutMs: number;
  readonly maxBufferedBytes: number | undefined;
  readonly policy: ReconnectPolicy;
}

export interface ConnectionManager {
  connect(opts?: { signal?: AbortSignal }): Promise<void>;
  send(message: SendInput, opts?: MllpSendOptions): Promise<MllpClientResponse>;
  close(): Promise<void>;
  readonly host: string;
  readonly port: number;
  readonly state: MllpClientState;
  readonly connected: boolean;
  readonly queueDepth: number;
}

/**
 * A send awaiting its turn on the wire. The manager serializes sends: one runs
 * at a time, the rest wait here in FIFO order. The per-send deadline starts
 * when `send()` is called, so it spans the queue wait as well as the write and
 * the ACK wait — a queued send can time out or be aborted before it is ever
 * written. The wire bytes are framed up front; the queue just transports them.
 */
interface QueuedSend {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  readonly timeoutMs: number;
  /** Combined deadline + caller signal; drives abort both queued and on-wire. */
  readonly abortSignal: AbortSignal;
  /** The deadline half; lets a waiter tell timeout from caller-abort. */
  readonly deadlineSignal: AbortSignal;
  resolve(response: MllpClientResponse): void;
  reject(error: Error): void;
  /** Stop the deadline timer. Idempotent. */
  clearDeadline(): void;
  /** Detach the while-queued abort listener (when the send goes on the wire). */
  detachQueuedAbort(): void;
}

export function createConnectionManager(
  opts: ManagerOptions
): ConnectionManager {
  const {
    host,
    port,
    connect,
    connectTimeoutMs,
    sendTimeoutMs,
    maxBufferedBytes,
  } = opts;

  // The connection lifecycle is owned by the state machine: its value answers
  // idle/connecting/connected/closed. Two wire-layer facts the machine does not
  // model are tracked here so `state` can report the public `sending`/`closing`
  // phases: whether a send is on the wire, and whether close()'s async teardown
  // is in progress.
  const machine = createActor(connectionMachine, {
    input: { policy: opts.policy },
  });
  machine.start();
  let onWire = false;
  let closing = false;

  // The live wire, once connected. The connection owns all per-connection state
  // (decoder, reader, frame buffer, the single-flight exchange) and its own
  // teardown — see ./connection.ts. Null when not connected.
  let connection: Connection | null = null;

  // Sends waiting for the wire (FIFO). The one currently on the wire has been
  // shifted out, so the queue holds only the not-yet-dispatched sends — which
  // is what queueDepth reports. `draining` guards the drain loop so only one
  // runs at a time.
  const queue: QueuedSend[] = [];
  let draining = false;

  const phase = () => machine.getSnapshot().value;
  const isConnected = () => phase() === "connected";

  const state = (): MllpClientState => {
    // close()'s async teardown reports as "closing" even though the machine has
    // already advanced to "closed" synchronously on CLOSE.
    if (closing) {
      return "closing";
    }
    const p = phase();
    if (p === "connected") {
      return onWire ? "sending" : "ready";
    }
    if (p === "idle") {
      return "idle";
    }
    if (p === "closed") {
      return "closed";
    }
    // connecting, plus the (currently unreachable) reconnect phases.
    return "connecting";
  };

  /**
   * Reject every still-queued send (those not yet on the wire). The on-wire
   * send, if any, is rejected separately by the connection. A queued send was
   * never dispatched, so it fails with `CLOSED` rather than `DROPPED` (which
   * means "ended while awaiting an ACK").
   */
  const failQueue = (message: string): void => {
    if (queue.length === 0) {
      return;
    }
    const tasks = queue.splice(0);
    for (const task of tasks) {
      task.detachQueuedAbort();
      task.clearDeadline();
      task.reject(new MllpClientError(MllpErrorCode.CLOSED, message));
    }
  };

  /**
   * Process queued sends one at a time while the wire is ready. A drop or close
   * during a send advances state out of "connected" and fails the rest of the
   * queue, so the loop exits cleanly.
   */
  const runQueue = async (): Promise<void> => {
    try {
      while (queue.length > 0 && isConnected()) {
        const conn = connection;
        if (conn === null) {
          return;
        }
        const task = queue.shift();
        if (task === undefined) {
          return;
        }
        task.detachQueuedAbort();
        onWire = true;
        try {
          const result = await conn.exchange(task);
          task.clearDeadline();
          task.resolve(result);
        } catch (error) {
          task.clearDeadline();
          task.reject(error as Error);
        } finally {
          onWire = false;
        }
        // A drop or close during the send advanced the machine out of
        // "connected" (and failed the rest of the queue), so the loop condition
        // exits. Otherwise the wire is still up and the next send proceeds.
      }
    } finally {
      draining = false;
    }
  };

  /** Kick the drain loop if it isn't already running and the wire is ready. */
  const drain = (): void => {
    // Only one drain loop runs at a time; it runs only while the wire is up and
    // idle (connected with no send on the wire — when a send is on the wire the
    // loop is already active, so `draining` is set).
    if (draining || !isConnected()) {
      return;
    }
    draining = true;
    void runQueue();
  };

  /**
   * The peer ended the live connection (drop, framing error, unsolicited-frame
   * flood, or a failed write). The connection has already settled its own
   * in-flight send and torn itself down; here we advance the machine and
   * dispose of the queue. With reconnect disabled the `DROP` drives the machine
   * to `closed`, so queued sends — which never reached the wire — fail
   * `CLOSED`.
   */
  const onConnectionDrop = (error: Error): void => {
    if (!isConnected()) {
      return;
    }
    machine.send({ error, type: "DROP" });
    connection = null;
    failQueue(
      "The connection ended before this queued send reached the wire; it was not transmitted."
    );
  };

  /**
   * Wrap a send in a {@link QueuedSend}, start its deadline, and hand it to the
   * drain loop. The deadline starts here so it covers the time spent waiting in
   * the queue. `AbortController` + `setTimeout` (not `AbortSignal.timeout`) so
   * the timer is cancellable on settle and never lingers.
   */
  const enqueue = (
    framed: Uint8Array,
    requestControlId: string,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined
  ): Promise<MllpClientResponse> =>
    // oxlint-disable-next-line promise/avoid-new -- queued-send deferred wrapper
    new Promise<MllpClientResponse>((resolve, reject) => {
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
        // Abort while still queued: drop from the queue and reject. Once on the
        // wire this listener is detached and the connection owns abort.
        const index = queue.indexOf(task);
        if (index !== -1) {
          queue.splice(index, 1);
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
      queue.push(task);
      drain();
    });

  const doConnect = async (
    connectOpts: { signal?: AbortSignal } = {}
  ): Promise<void> => {
    const current = phase();
    if (current === "closed" || closing) {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot connect: this client is ${state()} — it has been closed. Construct a new MllpClient to open a fresh connection.`
      );
    }
    if (current !== "idle") {
      throw new MllpClientError(
        MllpErrorCode.ALREADY_CONNECTED,
        `Cannot connect while ${state()}: an MllpClient opens one connection in its lifetime. Await the in-flight connect, or use a separate client for a concurrent connection.`
      );
    }
    machine.send({ type: "CONNECT" });

    const timeoutSignal = AbortSignal.timeout(connectTimeoutMs);
    const signal = connectOpts.signal
      ? AbortSignal.any([connectOpts.signal, timeoutSignal])
      : timeoutSignal;

    let duplex: MllpDuplex;
    try {
      duplex = await connect({ host, port, signal });
    } catch (error) {
      // Fails fast to "closed" (no reconnect on the initial connect). Guard the
      // send: a concurrent close() may have already taken the machine to
      // "closed", where the event is a no-op.
      if (phase() === "connecting") {
        machine.send({ error, type: "CONNECT_FAILED" });
      }
      if (connectOpts.signal?.aborted) {
        throw new MllpClientError(
          MllpErrorCode.CONNECT_ABORTED,
          `Connect to ${host}:${port} was aborted by the caller's abort signal.`,
          { cause: error }
        );
      }
      if (timeoutSignal.aborted) {
        throw new MllpClientError(
          MllpErrorCode.CONNECT_TIMEOUT,
          `Connect to ${host}:${port} timed out after ${connectTimeoutMs}ms.`,
          { timeoutMs: connectTimeoutMs }
        );
      }
      throw new MllpClientError(
        MllpErrorCode.CONNECT_FAILED,
        `Failed to connect to ${host}:${port}: the runtime adapter rejected the connection (see the error's cause).`,
        { cause: error }
      );
    }

    // Close-during-connect race. We sent CONNECT (→ "connecting") before the
    // `await` above; an `await` is a yield point, so a concurrent close() can
    // run while we are suspended. Re-check that invariant rather than test for
    // one specific state: anything other than "connecting" means we were
    // superseded (close() sends CLOSE → "closed"). Because close() ran while
    // `connection` was still null (it is assigned just below — the commit
    // point), it could not have torn down the socket the adapter just returned.
    // We now own that orphaned, open duplex: close it to avoid a leak, then
    // surface CONNECT_ABORTED.
    if (phase() !== "connecting") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        `Connect to ${host}:${port} was interrupted: close() was called while the connection was still being established.`
      );
    }

    // Advance the machine to "connected" BEFORE creating the connection, so a
    // drop reported by the connection's read loop lands while the machine can
    // handle DROP. (The loops are async and yield before acting, so `connection`
    // is assigned and the machine is connected before either can fire.)
    machine.send({ type: "CONNECTED" });
    connection = createConnection({
      duplex,
      host,
      maxBufferedBytes,
      onDrop: onConnectionDrop,
      port,
    });
  };

  // `async` keeps the Promise contract: the synchronous guard and toWireFrame()
  // failures below surface as rejections, never as synchronous throws — which is
  // what callers (and the tests) rely on. No `await` is needed in the body.
  // oxlint-disable-next-line eslint/require-await
  const doSend = async (
    message: SendInput,
    sendOpts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> => {
    if (closing || phase() === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot send: this client is ${state()} — it has been closed. Construct a new MllpClient to send again.`
      );
    }
    if (!isConnected()) {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${state()}, not connected. Call connect() before send().`
      );
    }

    // Build the wire bytes (caller bytes verbatim, or a serialized Root) and
    // read MSH-10 for correlation before enqueuing. Framing an unframable
    // payload rejects here, before it occupies a queue slot; reading MSH-10 is
    // best-effort and never blocks the send.
    const framed = toWireFrame(message);
    const requestControlId = readRequestControlId(message);
    const timeoutMs = sendOpts.timeoutMs ?? sendTimeoutMs;

    return enqueue(framed, requestControlId, timeoutMs, sendOpts.signal);
  };

  const doClose = async (): Promise<void> => {
    if (phase() === "closed" || closing) {
      return;
    }
    if (phase() === "idle") {
      machine.send({ type: "CLOSE" });
      return;
    }

    // The machine advances to "closed" synchronously here; `closing` keeps the
    // public state at "closing" until the async teardown below completes.
    closing = true;
    machine.send({ type: "CLOSE" });

    // Reject every queued send — none of them will reach the wire.
    failQueue("Client closed before this queued send was dispatched");

    // Hand teardown of the live wire to the connection: it settles the in-flight
    // send with CLOSED (the caller initiated this) and closes the duplex.
    const conn = connection;
    connection = null;
    if (conn) {
      await conn.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have reached the peer; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    }
    closing = false;
  };

  return {
    close: doClose,
    connect: doConnect,
    get connected() {
      return isConnected();
    },
    host,
    port,
    get queueDepth() {
      return queue.length;
    },
    send: doSend,
    get state() {
      return state();
    },
  };
}

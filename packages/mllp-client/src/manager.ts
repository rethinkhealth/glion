/**
 * `createConnectionManager` — the orchestrator behind {@link MllpClient}.
 *
 * Owns the connection state machine (./state.ts), the FIFO send queue + single
 * drain loop, the dial routine, and the disposition of queued / in-flight sends
 * across the connection lifecycle. It creates a fresh {@link Connection}
 * (./connection.ts) per dial and exposes the machine's phase directly as the
 * public {@link MllpClientState}.
 *
 * Functional-over-class (CLAUDE.md §4): the manager is a factory + closures;
 * the public `MllpClient` class is a thin facade over it. The instance-scoped
 * concerns live here; one connection's mortal wire state lives in the
 * `Connection` this manager creates.
 *
 * @module
 */

import type { Root } from "@glion/ast";

import { createConnection } from "./connection";
import type { Connection } from "./connection";
import type { MllpConnector, MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode } from "./errors";
import type { MllpClientResponse } from "./message";
import { requestControlId, toWireBytes } from "./message";
import { createSendQueue } from "./queue";
import { createConnectionState } from "./state";
import type { ConnectionPhase, ReconnectPolicy } from "./state";

/**
 * The public connection state reported by {@link ConnectionManager.state}. It
 * is the connection machine's own phase ({@link ConnectionPhase}) — there is no
 * separate client vocabulary to keep in sync. Until reconnect is enabled,
 * `backingOff`/`reconnecting` are unreachable. "Is a message on the wire right
 * now?" is intentionally NOT modelled here; observe it via lifecycle events.
 */
export type MllpClientState = ConnectionPhase;

export interface MllpSendOptions {
  /** Override the client's default ACK-wait deadline for this call. */
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
  connect(): Promise<void>;
  send(tree: Root, opts?: MllpSendOptions): Promise<MllpClientResponse>;
  close(): Promise<void>;
  readonly host: string;
  readonly port: number;
  readonly state: MllpClientState;
  readonly connected: boolean;
  readonly queueDepth: number;
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

  // The connection lifecycle is owned by the state machine; its snapshot value
  // IS the public connection state. The manager drives the machine with events
  // (CONNECT / CONNECTED / DROP / CLOSE) and trusts its transition table to
  // ignore illegal ones — it never reads the phase to decide *whether* to send
  // an event. Disposition reacts to the machine reaching "closed" (the
  // subscription below), so the call sites just send their event.
  const machine = createConnectionState(opts.policy);

  // The live wire, once connected. The connection owns all per-connection state
  // (decoder, reader, frame buffer, the single-flight exchange) and its own
  // teardown — see ./connection.ts. Null when not connected.
  let connection: Connection | null = null;

  // Sends waiting for the wire (FIFO) — a pure buffer (see ./queue.ts). The one
  // currently on the wire has been taken out, so depth reports only the
  // not-yet-dispatched sends. `draining` guards the drain loop so only one runs
  // at a time.
  //
  // The queue and `draining` live here, NOT in the machine's context, on
  // purpose: each queued send holds non-serializable payload (the caller's
  // resolve/reject and the framed bytes), which cannot go into a serializable
  // statechart context without forfeiting XState's inspector/persistence value.
  // The machine owns the connection LIFECYCLE; the manager owns the send queue.
  const queue = createSendQueue();
  let draining = false;

  const phase = () => machine.getSnapshot().value;
  const isConnected = () => phase() === "connected";

  /**
   * Reject every still-queued send (those not yet on the wire). The on-wire
   * send, if any, is rejected separately by the connection. A queued send was
   * never dispatched, so it fails with `CLOSED` rather than `DROPPED` (which
   * means "ended while awaiting an ACK").
   */
  const failQueue = (message: string): void => {
    queue.failAll(new MllpClientError(MllpErrorCode.CLOSED, message));
  };

  // The machine is the single authority on lifecycle: when it reaches "closed"
  // (a drop with no reconnect, an explicit close, or a failed connect), reject
  // every still-queued send and release the connection. Disposition reacts to
  // the transition here instead of being decided at each call site. The
  // in-flight send, if any, is settled by the connection (on a drop) or by
  // doClose's shutdown (on an explicit close), not here.
  machine.subscribe((snapshot) => {
    if (snapshot.value === "closed") {
      failQueue(
        "The connection closed before this queued send reached the wire; it was not transmitted."
      );
      connection = null;
    }
  });

  /**
   * Process queued sends one at a time while connected. A drop or close during
   * a send advances state out of "connected" and fails the rest of the queue,
   * so the loop exits cleanly. The ACK-wait deadline is owned by
   * `conn.exchange` (built and cleared there, scoped to one exchange); the loop
   * only hands over the wire bytes and the timeout budget.
   */
  const runQueue = async (): Promise<void> => {
    try {
      while (queue.depth > 0 && isConnected()) {
        // Both guards are impossible while connected (the loop asserts
        // isConnected(), so `connection` is non-null and a queued record
        // exists). We bail rather than throw so a broken invariant leaves the
        // sends buffered for a later drain/close instead of crashing the loop.
        const conn = connection;
        if (conn === null) {
          return;
        }
        const task = queue.take();
        if (task === undefined) {
          return;
        }
        // The exchange owns the ACK-wait deadline (built and cleared inside
        // conn.exchange); the manager just hands over the wire bytes, the
        // correlation id, and the timeout budget.
        try {
          const result = await conn.exchange({
            framed: task.framed,
            requestControlId: task.requestControlId,
            timeoutMs: task.timeoutMs,
          });
          task.resolve(result);
        } catch (error) {
          task.reject(error as Error);
        }
        // A drop or close during the send advanced the machine out of
        // "connected" (and failed the rest of the queue), so the loop condition
        // exits. Otherwise the wire is still up and the next send proceeds.
      }
    } finally {
      draining = false;
    }
  };

  /** Kick the drain loop if it isn't already running and we're connected. */
  const drain = (): void => {
    // Only one drain loop runs at a time; it runs only while connected with no
    // send on the wire — when a send is on the wire the loop is already active,
    // so `draining` is set.
    if (draining || !isConnected()) {
      return;
    }
    draining = true;
    void runQueue();
  };

  /**
   * The peer ended the live connection (drop, framing error, unsolicited-frame
   * flood, or a failed write). The connection has already settled its own
   * in-flight send and torn itself down; we just report the drop. The machine
   * routes `connected` → `closed` (reconnect disabled), whose disposition —
   * fail the queue, release the connection — runs in the subscription above. A
   * DROP in any other state is ignored by the machine, so no guard is needed
   * here.
   */
  const onConnectionDrop = (error: Error): void => {
    machine.send({ error, type: "DROP" });
  };

  const doConnect = async (): Promise<void> => {
    // Ask the machine whether CONNECT is legal — its transition table is the
    // authority (only `idle` accepts CONNECT). The phase is read only to phrase
    // the error, never to make the decision; throwing before CONNECT leaves a
    // live connection undisturbed.
    const snapshot = machine.getSnapshot();
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
    machine.send({ type: "CONNECT" });

    const timeoutSignal = AbortSignal.timeout(connectTimeoutMs);

    let duplex: MllpDuplex;
    try {
      duplex = await connect({ host, port, signal: timeoutSignal });
    } catch (error) {
      // Report the failure and trust the machine: it fails fast "connecting" →
      // "closed" (no reconnect on the initial connect) and ignores the event if
      // a concurrent close() already closed it.
      machine.send({ error, type: "CONNECT_FAILED" });
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

    // The dial succeeded — try to commit. The `await` above is a yield point, so
    // a concurrent close() may have run (CLOSE → "closed") while we were
    // suspended. Send CONNECTED and let the machine arbitrate: if it accepts
    // (→ "connected") we own the wire; if close() already closed it, CONNECTED is
    // ignored and we own an orphaned, open duplex (close() ran while `connection`
    // was still null, so it could not have torn it down) — close it to avoid a
    // leak, then surface CONNECT_ABORTED.
    machine.send({ type: "CONNECTED" });
    if (machine.getSnapshot().value !== "connected") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        `Connect to ${host}:${port} was interrupted: close() was called while the connection was still being established.`
      );
    }

    // Bind the connection only after the machine is "connected", so a drop
    // reported by the read loop lands while the machine can handle DROP.
    connection = createConnection({
      duplex,
      host,
      maxBufferedBytes,
      onDrop: onConnectionDrop,
      port,
    });
  };

  // `async` keeps the Promise contract: the synchronous guard and prepareSend()
  // failures below surface as rejections, never as synchronous throws — which is
  // what callers (and the tests) rely on. No `await` is needed in the body.
  // oxlint-disable-next-line eslint/require-await
  const doSend = async (
    tree: Root,
    sendOpts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> => {
    if (phase() === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot send: this client is ${phase()} — it has been closed. Construct a new MllpClient to send again.`
      );
    }
    if (!isConnected()) {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${phase()}, not connected. Call connect() before send().`
      );
    }

    // Serialize the tree to canonical wire bytes and read MSH-10 from it,
    // before enqueuing. An unframable payload rejects here, before it occupies
    // a queue slot. The string→tree parse already happened at the client
    // boundary (client.send); the manager only ever sees a Root.
    const timeoutMs = sendOpts.timeoutMs ?? sendTimeoutMs;

    // enqueue returns the caller's real Promise; the manager kicks the drain
    // loop (the queue is a pure buffer and does not drain itself).
    const promise = queue.enqueue(
      toWireBytes(tree),
      requestControlId(tree),
      timeoutMs
    );
    drain();
    return promise;
  };

  const doClose = async (): Promise<void> => {
    // Capture the live connection before CLOSE: reaching "closed" runs the
    // disposition subscription synchronously, which releases the reference.
    // CLOSE is idempotent — the machine ignores it once closed, and a null
    // `conn` (idle / connecting / already closed) means there is no wire to tear
    // down (a drop-initiated close already tore its own down).
    const conn = connection;
    machine.send({ type: "CLOSE" });

    // Tear down the live wire: the connection settles the in-flight send with
    // CLOSED (the caller initiated this) and closes the duplex. close() resolves
    // once teardown is done.
    if (conn) {
      await conn.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have reached the peer; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    }
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
      return queue.depth;
    },
    send: doSend,
    get state() {
      return phase();
    },
  };
}

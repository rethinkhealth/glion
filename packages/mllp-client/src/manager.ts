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
import { createSendQueue } from "./queue";
import type { ReconnectPolicy } from "./reconnect";
import type { MllpClientResponse } from "./response";
import { prepareSend } from "./send";
import { createConnectionState } from "./state";
import type { ConnectionPhase } from "./state";

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

  // The connection lifecycle is owned by the state machine; its value IS the
  // public connection state (no separate vocabulary to keep in sync). close()
  // drives the machine to "closed" synchronously, so every guard below can read
  // the phase directly rather than tracking a separate "closing" flag.
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

  const doConnect = async (): Promise<void> => {
    const current = phase();
    if (current === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot connect: this client is ${current} — it has been closed. Construct a new MllpClient to open a fresh connection.`
      );
    }
    if (current !== "idle") {
      throw new MllpClientError(
        MllpErrorCode.ALREADY_CONNECTED,
        `Cannot connect while ${current}: an MllpClient opens one connection in its lifetime. Await the in-flight connect, or use a separate client for a concurrent connection.`
      );
    }
    machine.send({ type: "CONNECT" });

    const timeoutSignal = AbortSignal.timeout(connectTimeoutMs);

    let duplex: MllpDuplex;
    try {
      duplex = await connect({ host, port, signal: timeoutSignal });
    } catch (error) {
      // Fails fast to "closed" (no reconnect on the initial connect). Guard the
      // send: a concurrent close() may have already taken the machine to
      // "closed", where the event is a no-op.
      if (phase() === "connecting") {
        machine.send({ error, type: "CONNECT_FAILED" });
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
    const { framed, requestControlId } = prepareSend(tree);
    const timeoutMs = sendOpts.timeoutMs ?? sendTimeoutMs;

    // enqueue returns the caller's real Promise; the manager kicks the drain
    // loop (the queue is a pure buffer and does not drain itself).
    const promise = queue.enqueue(framed, requestControlId, timeoutMs);
    drain();
    return promise;
  };

  const doClose = async (): Promise<void> => {
    if (phase() === "closed") {
      return;
    }
    if (phase() === "idle") {
      machine.send({ type: "CLOSE" });
      return;
    }

    // CLOSE drives the machine to "closed" synchronously, so `state` reports
    // "closed" immediately while the duplex teardown below is still awaited.
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

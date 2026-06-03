/**
 * `createConnection` — the mortal, per-connection wire layer for one socket.
 *
 * One {@link MllpDuplex} maps to one {@link Connection}. The connection owns
 * everything whose correct lifetime is a single connection: the
 * {@link FrameDecoder} (whose byte buffer survives across SENDS within this
 * connection — that is what lets a late ACK after a timeout land on the next
 * send — but must NEVER survive across connections), the read loop, peer-drop
 * detection, the single-flight wire exchange (write a frame, await exactly one
 * ACK racing {frame, deadline, caller-abort, drop}), and the unsolicited-frame
 * buffer.
 *
 * It deliberately knows nothing about the connection state machine or the send
 * queue. When the peer ends the connection (drop, framing error, unsolicited
 * frame flood, or a failed write), the connection settles its own in-flight
 * send and calls {@link ConnectionOptions.onDrop} exactly once so the owner can
 * advance the machine and dispose of the queue: the connection owns its own
 * teardown; the owner owns the machine + queue.
 *
 * Making this a fresh object per dial turns "reset connection-scoped state on
 * reconnect" from a discipline into a structural guarantee — a new connection
 * is a new decoder, so a stale frame from a dead socket physically cannot reach
 * the next connection.
 *
 * @module
 */

import { createFrameDecoder } from "@glion/mllp-transport";

import type { MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode, sendTimeoutError } from "./errors";
import { parseResponse } from "./message";
import type { MllpClientResponse } from "./message";

/**
 * Maximum unsolicited frames buffered between sends. A well-behaved peer sends
 * at most one ACK per request; a late frame from a previous timeout is
 * legitimate and queues here. A flood beyond this is a buggy or hostile peer
 * and terminates the connection.
 */
const MAX_PENDING_FRAMES = 16;

/**
 * Internal frame-waiter slot. The read loop hands each decoded frame here if a
 * send is awaiting one, otherwise queues it. At most one waiter is ever live —
 * the owner serializes sends so only one is on the wire at a time.
 */
interface FrameWaiter {
  resolve(bytes: Uint8Array): void;
  reject(error: Error): void;
}

/**
 * The subset of a queued send the wire exchange needs. The owner's richer
 * queued-send object satisfies this structurally.
 */
export interface ExchangeRequest {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  /**
   * ACK-wait deadline (ms). `exchange` owns the timer: it starts when the
   * exchange begins and is cleared the moment it settles. Elapsing is the only
   * way an on-wire send is cancelled — the client exposes no caller signal.
   */
  readonly timeoutMs: number;
}

export interface Connection {
  /**
   * Write `req` and resolve with the parsed ACK. Single-flight: the owner must
   * not call this concurrently. Rejects with `SEND_TIMEOUT` (deadline elapsed),
   * `DROPPED` (write failed), `CORRELATION_MISMATCH`/`PARSE_FAILED`/
   * `UNKNOWN_ACK_CODE` (bad ACK), or an `AckException` (NAK).
   */
  exchange(req: ExchangeRequest): Promise<MllpClientResponse>;
  /**
   * Explicit teardown initiated by the owner (close). Settles the in-flight
   * send, if any, with `reason`; closes the duplex. Resolves once the duplex is
   * closed; never rejects. Does not call `onDrop` (the owner initiated this).
   */
  shutdown(reason: MllpClientError): Promise<void>;
}

export interface ConnectionOptions {
  readonly duplex: MllpDuplex;
  readonly host: string;
  readonly port: number;
  readonly maxBufferedBytes: number | undefined;
  /**
   * Fired exactly once when the PEER (not the owner) ends the connection —
   * peer drop, framing error, unsolicited-frame flood, or a failed write. The
   * owner advances the machine and disposes of the queue here. Not called by
   * {@link Connection.shutdown}.
   */
  onDrop(error: MllpClientError): void;
}

export function createConnection(opts: ConnectionOptions): Connection {
  const { duplex, host, port, maxBufferedBytes, onDrop } = opts;

  const decoder = createFrameDecoder(
    maxBufferedBytes === undefined ? undefined : { maxBufferedBytes }
  );
  const reader = duplex.readable.getReader();

  let pendingFrames: Uint8Array[] = [];
  let frameWaiter: FrameWaiter | null = null;
  // Race recovery: a drop can land between writer.write() and the exchange
  // registering its waiter. Stash the error so the imminent waitForFrame
  // surfaces it instead of hanging. Lives and dies with this connection.
  let pendingError: MllpClientError | null = null;
  // Terminal latch: set by the first drop OR by shutdown. Guarantees teardown
  // and onDrop run at most once for this connection.
  let dead = false;
  // True when the owner initiated teardown (shutdown), so the peer-drop watcher
  // does not also report a drop.
  let closingExplicit = false;

  /**
   * The peer ended the connection. Settle the in-flight send, tear down our
   * resources, and notify the owner — once. The machine transition and queue
   * disposition are the owner's job, done in onDrop.
   */
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
    // onDrop first (machine transition + queue disposition), then the on-wire
    // waiter — so the queue is failed before the in-flight send rejects, and a
    // caller observing one sees consistent state.
    onDrop(error);
    if (waiter) {
      waiter.reject(error);
    } else {
      // No waiter yet — a send may be mid-write and about to call waitForFrame.
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
          // The peer half closed; watchForDrop (awaiting duplex.closed) reports
          // the drop. Just exit.
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
      // errored. watchForDrop or shutdown owns the teardown; nothing to do.
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
    // A drop fired between writer.write() and this registration — surface it
    // instead of waiting on a dead stream. `pendingError` is a narrowed
    // MllpClientError; the lint false-positives on the closure-local narrowing.
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

    // Write the frame. Lock acquisition / release is bracketed.
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

    // The ACK-wait deadline is owned here, scoped to exactly this exchange:
    // started now, cleared in `finally` the moment the send settles. The timer
    // elapsing is the only way an on-wire send is cancelled (the client has no
    // caller signal). `AbortController` + `setTimeout` (not `AbortSignal.timeout`)
    // so the timer is cancellable and never lingers.
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
      // reset it so the next send on this connection isn't corrupted by the
      // partial. A complete late ACK would already have been emitted
      // (buffered === 0).
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
      // A send may be mid-write; the imminent waitForFrame reads this.
      pendingError = reason;
    }
    pendingFrames = [];
    // Release the reader's lock so duplex.close() can drain cleanly. A
    // spec-compliant adapter MAY reject the pending read() with TypeError; the
    // read loop catches that and bails.
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

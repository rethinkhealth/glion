/**
 * The per-connection wire for {@link MllpClient}.
 *
 * One {@link MllpDuplex} maps to one {@link Connection}. It owns everything whose
 * correct lifetime is a single connection: the FrameDecoder (whose byte buffer
 * survives across SENDS within this connection — that is what lets a late ACK
 * after a timeout land on the next send — but must NEVER survive across
 * connections), the read loop, peer-drop detection, the single-flight wire
 * exchange, and the unsolicited-frame buffer. A fresh object per connection
 * makes "reset connection-scoped state on reconnect" a structural guarantee
 * rather than a discipline.
 *
 * @module
 */

import { createFrameDecoder } from "@glion/mllp-transport";

import { parseResponse } from "./ack";
import type { MllpClientResponse } from "./ack";
import type { MllpDuplex } from "./client";
import { MllpClientError, MllpErrorCode } from "./errors";

/**
 * Maximum unsolicited frames buffered between sends; a flood beyond this is
 * terminal.
 */
const MAX_PENDING_FRAMES = 16;

/**
 * A deferred: the captured `resolve` / `reject` of the ONE in-flight exchange's
 * ACK promise. `waitForFrame` creates the promise and parks its settlers here
 * so settlement can come from elsewhere — the read loop hands it the matching
 * frame ({@link dispatchFrame} → `resolve`), or a teardown fails it
 * ({@link
 * dispatchError} / `shutdown` → `reject`). This is the bridge from the
 * event-driven read loop to the per-send `Promise<MllpClientResponse>`; XState
 * gives no request/response primitive, so single-flight makes it a single
 * deferred rather than a correlation map.
 */
interface PendingAck {
  /** Deliver the ACK frame to the parked send. */
  resolve(bytes: Uint8Array): void;
  /** Fail the parked send — a send timeout, a peer drop, or `close()`. */
  reject(error: Error): void;
}

export interface ExchangeRequest {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  /** ACK-wait deadline (ms); `exchange` owns the timer, scoped to one exchange. */
  readonly timeoutMs: number;
}

export interface Connection {
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

export interface ConnectionOptions {
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

/**
 * Build the live wire over one open `duplex` and start reading immediately.
 * Returns a single-flight {@link Connection}: call {@link Connection.exchange}
 * one at a time, {@link Connection.shutdown} to tear down. Every piece of
 * connection-scoped state — the decoder buffer, the reader, the in-flight
 * pending ACK, the unsolicited-frame buffer — is closed over here, so a fresh
 * call
 * per dial resets all of it by construction; a `Connection` is never reused.
 *
 * Teardown is single-latched (`dead`): the FIRST of a peer drop
 * ({@link dispatchError}) or an owner {@link Connection.shutdown} wins and the
 * rest are no-ops. A peer drop fires `onDrop` once; an owner shutdown does not
 * (the owner already knows it is closing).
 */
export function createConnection(opts: ConnectionOptions): Connection {
  const { duplex, host, port, maxBufferedBytes, onDrop } = opts;

  const decoder = createFrameDecoder(
    maxBufferedBytes === undefined ? undefined : { maxBufferedBytes }
  );
  const reader = duplex.readable.getReader();

  // Inbound routing is single-flight: at most one exchange waits at a time
  // (`pendingAck`). A frame that arrives with nothing waiting — a late ACK from
  // previously timed-out send — is buffered in `pendingFrames` so the NEXT
  // waitForFrame drains it (and the correlation check rejects a stale id),
  // capped so an unsolicited-frame flood cannot grow memory without bound.
  let pendingFrames: Uint8Array[] = [];
  let pendingAck: PendingAck | null = null;
  // Race recovery: a drop can land between writer.write() and the exchange
  // registering its pending ACK. Stash the error so the imminent waitForFrame
  // it instead of hanging.
  let pendingError: MllpClientError | null = null;
  // Terminal latch: set by the first drop OR by shutdown — teardown + onDrop run
  // at most once.
  let dead = false;
  let closingExplicit = false;

  // Peer-initiated teardown (the counterpart to owner `shutdown`): a drop the
  // connection detected. Latch `dead`, close the duplex, notify the owner once
  // via onDrop, then reject the in-flight send — or stash the error for the
  // exchange that is about to register its pending ACK.
  function dispatchError(error: MllpClientError): void {
    if (dead) {
      return;
    }
    dead = true;
    const pending = pendingAck;
    pendingAck = null;
    pendingFrames = [];
    // Fire-and-forget — the adapter contract guarantees close() resolves.
    void duplex.close();
    // onDrop first (machine transition), then the pending ACK, so a caller
    // observing the lifecycle and the send rejection sees consistent state.
    onDrop(error);
    if (pending) {
      pending.reject(error);
    } else {
      pendingError = error;
    }
  }

  function dispatchFrame(bytes: Uint8Array): void {
    const pending = pendingAck;
    if (pending) {
      pendingAck = null;
      pending.resolve(bytes);
      return;
    }
    if (pendingFrames.length >= MAX_PENDING_FRAMES) {
      dispatchError(
        new MllpClientError(
          MllpErrorCode.DROPPED,
          `The peer sent more than ${MAX_PENDING_FRAMES} unsolicited frames with no matching request; closing the connection to avoid unbounded buffering.`
        )
      );
      return;
    }
    pendingFrames.push(bytes);
  }

  // The inbound pump: drain the reader, feed bytes to the decoder, route each
  // decoded frame. Exits quietly on EOF or a released lock; a decoder error is a
  // terminal drop (the decoder's buffer state is undefined past that point).
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

  // The second drop signal. runReadLoop only sees a drop as reader EOF/error;
  // `duplex.closed` resolves on any either-side teardown, so this catches a
  // close that never surfaces as a read result. Silent when the owner closed.
  async function watchForDrop(): Promise<void> {
    await duplex.closed;
    if (closingExplicit || dead) {
      return;
    }
    dispatchError(
      new MllpClientError(
        MllpErrorCode.DROPPED,
        `The peer at ${host}:${port} closed the connection.`
      )
    );
  }

  // Await the ACK for the in-flight exchange. Registers the single pending ACK —
  // first drains a drop that raced ahead of registration (`pendingError`) or a
  // frame already buffered (`pendingFrames`), so an exchange can never park
  // forever. The deadline signal (owned by `exchange`) bounds the wait.
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

    // oxlint-disable-next-line promise/avoid-new -- canonical promise wrapper
    return new Promise<Uint8Array>((resolve, reject) => {
      const onTimeout = () => {
        if (pendingAck === pending) {
          pendingAck = null;
        }
        reject(MllpClientError.timeout(timeoutMs));
      };

      const pending: PendingAck = {
        reject: (error) => {
          deadlineSignal.removeEventListener("abort", onTimeout);
          reject(error);
        },
        resolve: (bytes) => {
          deadlineSignal.removeEventListener("abort", onTimeout);
          resolve(bytes);
        },
      };

      pendingAck = pending;
      if (deadlineSignal.aborted) {
        onTimeout();
        return;
      }
      deadlineSignal.addEventListener("abort", onTimeout, { once: true });
    });
  }

  // One single-flight round trip: write the framed message, await the next frame
  // as its ACK under a fresh per-exchange deadline, parse it, and stamp the wire
  // timing. The caller (client `send()`) guarantees no concurrent exchange.
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
        { cause: error }
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
      // parseResponse is the codec; the exchange owns the wire timing.
      const ack = parseResponse(ackBytes, req.requestControlId);
      return { ...ack, durationMs, timestamp };
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

  // Owner-initiated teardown (the counterpart to a peer drop via dispatchError):
  // settle the in-flight send with `reason`, release the reader, close the
  // duplex — once, behind the `dead` latch. Does NOT fire onDrop (the owner
  // asked for this). Resolves; never rejects.
  async function shutdown(reason: MllpClientError): Promise<void> {
    if (dead) {
      // A peer drop already tore this connection down; nothing left to settle.
      return;
    }
    closingExplicit = true;
    dead = true;
    const pending = pendingAck;
    if (pending) {
      pendingAck = null;
      pending.reject(reason);
    } else {
      pendingError = reason;
    }
    pendingFrames = [];
    // Releasing the lock rejects the read parked in runReadLoop with a
    // TypeError ("Invalid state: Releasing reader"), which that loop's catch
    // absorbs. releaseLock() itself never throws here, so it needs no guard.
    reader.releaseLock();
    await duplex.close();
  }

  void runReadLoop();
  void watchForDrop();

  return { exchange, shutdown };
}

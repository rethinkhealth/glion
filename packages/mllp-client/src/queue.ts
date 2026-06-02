/**
 * `createSendQueue` — the FIFO send buffer for {@link MllpClient}.
 *
 * A pure, wire-agnostic deferred-promise queue. It holds the sends waiting
 * their turn on the wire and nothing else: it never touches the socket, the
 * connection, an `AbortSignal`, or a timer. Each record carries only the wire
 * bytes, the correlation id, the ACK deadline (in ms — the manager turns it
 * into a real timer at the dispatch instant, not here), and the deferred
 * promise's settle handles.
 *
 * The manager owns all control flow — the single-flight drain loop, the
 * "is the wire up?" gate, building the per-send wire deadline, and calling
 * `connection.exchange`. The queue just buffers: `enqueue` returns the caller's
 * real `Promise`, `take` hands the head record to the drain loop, and `failAll`
 * rejects everything still waiting (the manager supplies the error, e.g.
 * `CLOSED`). The in-flight send — already `take`-n — is settled by the
 * connection, not here.
 *
 * Keeping the queue this dumb is what makes it unit-testable with no sockets,
 * no state machine, and no fakes: enqueue, then assert the returned promise
 * settles when the test calls the record's `resolve`/`reject`.
 *
 * @module
 */

import type { MllpClientResponse } from "./response";

/**
 * One send waiting its turn on the wire. Carries the wire bytes, the
 * correlation id, the ACK deadline, and the deferred promise's settle handles —
 * no `AbortSignal`, no timer, no cleanup closures. The manager builds the
 * deadline when it dispatches the record and feeds it straight to
 * `connection.exchange`; the queue never sees it.
 */
export interface PendingSend {
  readonly framed: Uint8Array;
  readonly requestControlId: string;
  /**
   * ACK-wait deadline (ms). The clock starts when the manager dispatches this
   * record to the wire, not when it was enqueued.
   */
  readonly timeoutMs: number;
  resolve(response: MllpClientResponse): void;
  reject(error: Error): void;
}

export interface SendQueue {
  /**
   * Wrap a send in a real `Promise`, capture its settle handles on a buffered
   * record, and return the promise. Does NOT drain — the manager kicks its loop
   * after calling this. Pure bookkeeping: no signal, no timer, no wire.
   */
  enqueue(
    framed: Uint8Array,
    requestControlId: string,
    timeoutMs: number
  ): Promise<MllpClientResponse>;
  /**
   * Remove and return the head record (FIFO), or `undefined` if empty. The
   * manager calls this in its drain loop to pull the next send for the wire.
   * Once taken, a record is no longer the queue's responsibility — the manager
   * (via the connection) settles it.
   */
  take(): PendingSend | undefined;
  /**
   * Reject every still-buffered record with `error` and empty the buffer. The
   * manager supplies the error (`CLOSED` on drop/close); the queue only drains
   * and rejects. The in-flight (already-taken) send is settled elsewhere.
   */
  failAll(error: Error): void;
  /** Count of records still waiting (excludes any already taken for the wire). */
  readonly depth: number;
}

export function createSendQueue(): SendQueue {
  const buffer: PendingSend[] = [];

  return {
    get depth(): number {
      return buffer.length;
    },

    enqueue(
      framed: Uint8Array,
      requestControlId: string,
      timeoutMs: number
    ): Promise<MllpClientResponse> {
      // Deferred-send wrapper: the settle handles outlive this executor and
      // fire from the manager's drain loop (or failAll), so a raw Promise is
      // the right tool here.
      // oxlint-disable-next-line promise/avoid-new -- deferred-send wrapper
      return new Promise<MllpClientResponse>((resolve, reject) => {
        buffer.push({ framed, reject, requestControlId, resolve, timeoutMs });
      });
    },

    failAll(error: Error): void {
      // Splice the whole buffer first so a synchronous reject continuation
      // can't observe a half-drained queue.
      const pending = buffer.splice(0);
      for (const task of pending) {
        task.reject(error);
      }
    },

    take(): PendingSend | undefined {
      return buffer.shift();
    },
  };
}

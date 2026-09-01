/**
 * The response inbox for one MLLP connection — where everything the remote
 * system sends back waits to be collected.
 *
 * Nearly every response that lands here is an acknowledgment: the ACK
 * answering the HL7v2 message just sent. The read loop *delivers* each
 * response as the wire de-frames it; the in-flight send *takes* the next one
 * under its ACK deadline; teardown *closes* the inbox once with the reason
 * the connection ended. Pull, not push: a response — or the connection's
 * failure — that arrives before the send is waiting is simply stored, so
 * "the connection dropped between writing the message and awaiting its ACK"
 * is not a race to recover from — the next {@link ResponseInbox.take} just
 * sees it.
 *
 * Responses queue FIFO while no take is waiting. The queued ones are the
 * protocol's stragglers: unsolicited or duplicate frames this connection
 * never asked for — the next take drains one as if it were the awaited ACK,
 * and the MSA-2 ↔ MSH-10 correlation check rejects it (a rejection that is
 * connection-terminal at the exchange layer).
 * `close(error)` is idempotent — the first reason wins, whether the remote
 * system dropped the connection, a frame failed to decode, or our own
 * `close()` ran — and it settles the pending ACK by rejecting it, exactly as
 * closing a channel wakes blocked receivers. Once closed, every take rejects
 * with that stored failure, and later deliveries are discarded (the
 * connection is already dead — a straggling ACK is not an error).
 *
 * **Single-consumer contract.** MLLP exchanges are single-flight — one
 * message on the wire, one ACK awaited — so at most one `take` may be
 * outstanding, and the one in-flight send is the only taker. This is a
 * documented contract, not a runtime check. The inbox does not bound its
 * queue; the connection watches {@link ResponseInbox.size} and enforces the
 * unsolicited-message flood policy itself.
 *
 * @module
 */

/**
 * The send currently awaiting its acknowledgment — the captured `resolve` /
 * `reject` of the ONE outstanding {@link ResponseInbox.take}.
 *
 * A take parks here only when the inbox is empty: the ACK has not arrived
 * yet, so the send's promise cannot settle. Three independent events then
 * race to end the wait — the ACK arriving ({@link ResponseInbox.deliver}
 * resolves it), the connection ending ({@link ResponseInbox.close} rejects
 * it with the connection's failure), and the ACK deadline expiring (the
 * take's abort signal rejects it with the caller's timeout error). Capturing
 * the settlers is what lets whichever event fires FIRST settle the send's
 * promise from outside it; the winner clears this slot — and detaches the
 * deadline listener — so the losers find nothing to settle: no double
 * settlement, no leaked timer listeners.
 *
 * Single-flight means at most one pending ACK exists at a time.
 */
interface PendingAck {
  reject(reason: unknown): void;
  resolve(response: Uint8Array): void;
}

export interface ResponseInbox {
  /** Responses received and not yet taken. */
  readonly size: number;
  /**
   * The reason the connection ended, once {@link close} has run; `null` while
   * open.
   */
  readonly failure: Error | null;
  /**
   * Hand one inbound response to the send awaiting its ACK, or queue it
   * FIFO. Discarded silently once the inbox is closed.
   */
  deliver(response: Uint8Array): void;
  /**
   * Collect the next response — for the in-flight send, its ACK. A queued
   * response resolves immediately (even if `signal` already aborted — drain
   * first); otherwise the take parks as the {@link PendingAck} until the
   * next {@link deliver}, {@link close} (rejects with the connection's
   * failure), or `signal` abort (rejects with `signal.reason` — the caller
   * owns the ACK deadline and its error). Single-consumer: never call while
   * another take is outstanding.
   */
  take(signal: AbortSignal): Promise<Uint8Array>;
  /**
   * Close the inbox with the reason the connection ended. Idempotent — the
   * first reason wins. Queued responses are discarded and a pending ACK
   * rejects with `error`.
   */
  close(error: Error): void;
}

export function createResponseInbox(): ResponseInbox {
  let responses: Uint8Array[] = [];
  let pendingAck: PendingAck | null = null;
  let failure: Error | null = null;

  return {
    close(error: Error): void {
      if (failure !== null) {
        return;
      }
      failure = error;
      responses = [];
      const awaiting = pendingAck;
      pendingAck = null;
      awaiting?.reject(error);
    },

    deliver(response: Uint8Array): void {
      if (failure !== null) {
        return;
      }
      const awaiting = pendingAck;
      if (awaiting) {
        pendingAck = null;
        awaiting.resolve(response);
        return;
      }
      responses.push(response);
    },

    get failure(): Error | null {
      return failure;
    },

    get size(): number {
      return responses.length;
    },

    take(signal: AbortSignal): Promise<Uint8Array> {
      if (failure !== null) {
        // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- failure is a narrowed Error
        return Promise.reject(failure);
      }
      const queued = responses.shift();
      if (queued !== undefined) {
        return Promise.resolve(queued);
      }
      if (signal.aborted) {
        // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- the caller supplies an Error as the abort reason
        return Promise.reject(signal.reason);
      }
      // oxlint-disable-next-line promise/avoid-new -- captures the pending ACK's settlers
      return new Promise<Uint8Array>((resolve, reject) => {
        const onDeadline = () => {
          pendingAck = null;
          reject(signal.reason);
        };
        pendingAck = {
          reject: (reason) => {
            signal.removeEventListener("abort", onDeadline);
            reject(reason);
          },
          resolve: (response) => {
            signal.removeEventListener("abort", onDeadline);
            resolve(response);
          },
        };
        signal.addEventListener("abort", onDeadline, { once: true });
      });
    },
  };
}

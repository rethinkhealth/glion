/**
 * One live MLLP connection for {@link MllpClient} — the wire an HL7v2
 * conversation runs over.
 *
 * One {@link MllpDuplex} maps to one `Connection`, which owns everything whose
 * correct lifetime is that single connection: the frame decoder (whose byte
 * buffer survives across sends WITHIN the connection — that is what lets a
 * coalesced or late ACK land on the next send — and never beyond it; the
 * client builds a fresh `Connection` each time it connects, so decoder state
 * can never leak from one connection into the next), the read loop, drop
 * detection, and the exchange itself — one HL7v2 message out, its
 * acknowledgment back.
 *
 * The inbound path is pull-based: the wire pipeline — `duplex.readable` piped
 * through `unframe()` — yields one de-framed response per read, and a single
 * pump _delivers_ them into the connection's response inbox; `exchange()`
 * _takes_ the next one — its ACK — under the ACK deadline. The inbox's closed
 * state is THE teardown latch: whichever terminal event comes first — the
 * remote system dropping the connection, a frame that fails to decode, a write
 * failure, an unsolicited-message flood, or an owner `shutdown()` — closes the
 * inbox with its reason, and everything else (a second drop signal, a response
 * already in flight, the next take) observes that single stored failure. A
 * remote-initiated teardown fires `onDrop` exactly once; an owner shutdown does
 * not (the owner already knows it is closing).
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { unframe } from "@glion/mllp-codec";

import { parseResponse } from "./ack";
import type { MllpClientResponse } from "./ack";
import type { MllpDuplex } from "./client";
import { MllpClientError, MllpErrorCode } from "./errors";
import { createResponseInbox } from "./inbox";

/**
 * Maximum unsolicited inbound messages queued between sends; a flood beyond
 * this is terminal.
 */
const MAX_UNSOLICITED_MESSAGES = 16;

/** One send, ready for the wire: what `exchange()` needs to run it. */
export interface ExchangeRequest {
  /** The MLLP-framed HL7v2 message bytes. */
  readonly framed: Uint8Array;
  /** The message's MSH-10, correlated against the ACK's MSA-2. */
  readonly requestControlId: string;
  /** ACK deadline (ms); `exchange` owns the timer, scoped to one send. */
  readonly timeoutMs: number;
}

export interface Connection {
  /**
   * Send one framed HL7v2 message and resolve with its parsed acknowledgment.
   * Single-flight — one exchange at a time, never concurrent.
   */
  exchange(req: ExchangeRequest): Promise<MllpClientResponse>;
  /**
   * The client is closing this connection: reject the send awaiting its ACK
   * with `reason`, close the duplex.
   */
  shutdown(reason: MllpClientError): Promise<void>;
}

export interface ConnectionOptions {
  readonly duplex: MllpDuplex;
  readonly host: string;
  readonly port: number;
  readonly maxBufferedBytes: number | undefined;
  /** Parses inbound ACK text to a tree (the client injects this). */
  readonly parser: (input: string) => Root;
  /**
   * Fired once when the connection ends for any reason other than an owner
   * `shutdown()` — the remote system hung up, or the wire failed.
   */
  onDrop(error: MllpClientError): void;
}

/**
 * Build the live wire over one open `duplex` and start reading immediately.
 * Returns a single-flight {@link Connection}: call `exchange()` one at a time,
 * `shutdown()` to tear down. A `Connection` is never reused — the client
 * builds a fresh one each time it connects.
 */
export function createConnection(opts: ConnectionOptions): Connection {
  const { duplex, host, port, maxBufferedBytes, onDrop, parser } = opts;

  // The wire pipeline: raw socket bytes piped through unframe() yield one
  // de-framed HL7v2 response per read. Framing violations error the pipeline.
  const reader = duplex.readable
    .pipeThrough(unframe({ maxBufferedBytes }))
    .getReader();
  const inbox = createResponseInbox();

  // Remote-initiated teardown (the counterpart to owner `shutdown`). Once-only:
  // the first terminal event closes the inbox with its reason (rejecting the
  // send awaiting its ACK); everything after sees the inbox already closed and
  // bows out.
  function dropConnection(error: MllpClientError): void {
    if (inbox.failure) {
      return;
    }
    inbox.close(error);
    // Fire-and-forget — the adapter contract guarantees close() resolves.
    void duplex.close();
    onDrop(error);
  }

  // The inbound pump: pull de-framed responses off the wire pipeline and
  // deliver them to the inbox. EOF exits quietly (watchForDrop reports the
  // drop); a framing violation — bytes between frames, a frame glued into an
  // unterminated one, an unterminated frame at end-of-stream, the buffer cap —
  // errors the pipeline and lands in the catch as a terminal drop. More queued
  // responses than MAX_UNSOLICITED_MESSAGES with no send waiting is an
  // unsolicited-message flood — also terminal.
  async function runReadLoop(): Promise<void> {
    try {
      while (true) {
        const { done, value: response } = await reader.read();
        if (done || inbox.failure) {
          return;
        }
        if (inbox.size >= MAX_UNSOLICITED_MESSAGES) {
          dropConnection(
            new MllpClientError(
              MllpErrorCode.DROPPED,
              `Received more than ${MAX_UNSOLICITED_MESSAGES} unsolicited messages with no matching request; closing the connection to avoid unbounded buffering.`
            )
          );
          return;
        }
        inbox.deliver(response);
      }
    } catch (error) {
      // The pipeline errored — a MllpCodecError from unframe(), or the duplex
      // readable failing after teardown. dropConnection's once-only latch
      // makes the post-shutdown case a no-op.
      dropConnection(
        new MllpClientError(
          MllpErrorCode.DROPPED,
          error instanceof Error
            ? error.message
            : `The connection to ${host}:${port} failed while reading.`,
          { cause: error }
        )
      );
    }
  }

  // The second drop signal. runReadLoop only sees the connection end as a
  // reader EOF/error; `duplex.closed` resolves on any either-side teardown, so
  // this catches a remote hang-up that never surfaces as a read result. After
  // an owner shutdown the inbox is already closed, so this is a no-op.
  async function watchForDrop(): Promise<void> {
    await duplex.closed;
    // The closed signal can outrun the last inbound frames still inside the
    // wire pipeline's microtask hops — a one-shot remote system writes the
    // ACK and closes in the same instant. One macrotask lets those
    // deliveries (and the read loop) settle first, so the ACK reaches the
    // waiting exchange before this drop closes the inbox.
    // oxlint-disable-next-line promise/avoid-new -- one-macrotask deferral
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    dropConnection(
      new MllpClientError(
        MllpErrorCode.DROPPED,
        `The connection to ${host}:${port} was closed.`
      )
    );
  }

  // Write one frame under the send deadline. `writer.write` takes no signal,
  // so the write races the deadline; a deadline that wins mid-write is
  // handled by the caller (exchange) as terminal — a partial frame may be on
  // the wire.
  async function writeFramed(
    framed: Uint8Array,
    signal: AbortSignal
  ): Promise<void> {
    const writer = duplex.writable.getWriter();
    // oxlint-disable-next-line promise/avoid-new -- adapt the signal to a race
    const abortedPromise = new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
    // The deadline may fire after this race is already decided (during the
    // ACK wait); the stray rejection of abortedPromise has no consumer then
    // and must not surface as an unhandled rejection.
    // oxlint-disable-next-line promise/prefer-await-to-then -- a detached rejection guard; awaiting would defeat the race
    abortedPromise.catch(() => {
      // handled by the race when it matters
    });
    // Node 20 throws synchronously from write() on a closed/errored stream
    // (ERR_INTERNAL_ASSERTION; fixed in Node 21+, never backported) where
    // later Nodes reject the returned promise. The write sits inside the try
    // so both shapes land in the same catch and wrap as DROPPED.
    let pendingWrite: Promise<void> | undefined;
    try {
      pendingWrite = writer.write(framed);
      await Promise.race([pendingWrite, abortedPromise]);
    } catch (error) {
      if (signal.aborted && error === signal.reason) {
        // Deadline fired while the write was parked (the remote system
        // stopped reading). This send already fails with the timeout and the
        // caller drops the connection; the parked write's eventual
        // settlement against the closing duplex has no consumer.
        // oxlint-disable-next-line promise/prefer-await-to-then -- a detached rejection guard; the send already failed
        pendingWrite?.catch(() => {
          // non-actionable: the send failed and the connection is dropping
        });
        throw error;
      }
      // The write itself failed — terminal. dropConnection tears the
      // CONNECTION down; the throw fails THIS send — the write failed before
      // the send parked as the pending ACK, so closing the inbox has nothing
      // to reject.
      const dropped = new MllpClientError(
        MllpErrorCode.DROPPED,
        `Failed to write the framed message to ${host}:${port}; the connection is no longer usable (see the error's cause).`,
        { cause: error }
      );
      dropConnection(dropped);
      throw dropped;
    } finally {
      writer.releaseLock();
    }
  }

  // One exchange: write the framed HL7v2 message and take the next response
  // as its ACK, all under ONE send deadline covering both phases. A deadline
  // that expires is connection-terminal either way: mid-write a partial frame
  // may be on the wire, and after a timed-out wait a late ACK could never be
  // matched safely again — dropping keeps acknowledgment correlation
  // trustworthy (most MLLP implementations recycle the connection the same
  // way). The caller (client `send()`) guarantees single-flight.
  async function exchange(req: ExchangeRequest): Promise<MllpClientResponse> {
    const sentMonotonic = performance.now();

    // The abort reason IS the timeout error, so both the write race and the
    // inbox reject the pending work with it directly.
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => {
      deadline.abort(MllpClientError.timeout(req.timeoutMs));
    }, req.timeoutMs);

    try {
      await writeFramed(req.framed, deadline.signal);
      const ackBytes = await inbox.take(deadline.signal);
      const timestamp = new Date();
      const durationMs = performance.now() - sentMonotonic;
      // parseResponse is the codec; the exchange owns the wire timing.
      const ack = parseResponse(ackBytes, req.requestControlId, parser);
      return { ...ack, durationMs, timestamp };
    } catch (error) {
      // A timeout and an uninterpretable reply are both connection-terminal:
      // after either, this wire's acknowledgment correlation can no longer
      // be trusted — a stray or unmatched frame would be consumed as the
      // next send's ACK and desynchronize every send after it. The caller
      // still sees the original error; the connection latches DROPPED with
      // it as the cause. (A NAK is an AckException — the remote system
      // answered properly — and does not drop.)
      if (
        error instanceof MllpClientError &&
        (error.code === MllpErrorCode.SEND_TIMEOUT ||
          error.code === MllpErrorCode.INVALID_RESPONSE)
      ) {
        dropConnection(
          new MllpClientError(
            MllpErrorCode.DROPPED,
            error.code === MllpErrorCode.SEND_TIMEOUT
              ? `The connection to ${host}:${port} was closed after a send timed out; a late acknowledgment could not be matched safely.`
              : `The connection to ${host}:${port} was closed after an uninterpretable reply; acknowledgment correlation can no longer be trusted.`,
            { cause: error }
          )
        );
      }
      throw error;
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  // Owner-initiated teardown: reject the send awaiting its ACK with `reason`,
  // close the duplex — once, via the inbox's closed state. Does NOT fire
  // onDrop (the owner asked for this). Resolves; never rejects.
  async function shutdown(reason: MllpClientError): Promise<void> {
    if (inbox.failure) {
      // A drop already tore this connection down; nothing left to settle.
      return;
    }
    inbox.close(reason);
    // Closing the duplex ends the wire pipeline: the read parked in
    // runReadLoop resolves done (or rejects into its catch, where the
    // once-only latch makes it a no-op).
    await duplex.close();
  }

  void runReadLoop();
  void watchForDrop();

  return { exchange, shutdown };
}

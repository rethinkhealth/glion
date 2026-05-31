/**
 * The `MllpClient` class — persistent MLLP client for HL7v2. One send is on the
 * wire at a time; concurrent sends queue (FIFO) and run one after another.
 *
 * @module
 */

import { createFrameDecoder } from "@glion/mllp-transport";
import type { FrameDecoder } from "@glion/mllp-transport";

import type { MllpConnector, MllpDuplex } from "./duplex";
import { MllpClientError, MllpErrorCode } from "./errors";
import { parseResponse, readRequestControlId, toWireFrame } from "./hl7v2";
import type { MllpClientResponse, SendInput } from "./hl7v2";

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
 * Maximum unsolicited frames buffered between sends. A well-behaved
 * peer sends at most one ACK per request; multiple ACKs (e.g. an
 * unsolicited late frame from a previous timeout) are legitimate and
 * queue here. A flood of more than this is a buggy or hostile peer
 * and terminates the connection.
 */
const MAX_PENDING_FRAMES = 16;

/**
 * Internal frame-waiter slot. The read loop dispatches each decoded
 * frame here if a `send()` is waiting, otherwise queues it. At most one
 * waiter is active at a time — the send queue serializes sends so only
 * one is ever on the wire.
 */
interface FrameWaiter {
  resolve(bytes: Uint8Array): void;
  reject(error: Error): void;
}

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

  #state: MllpClientState = "idle";
  #duplex: MllpDuplex | null = null;
  #closingExplicit = false;

  // Persistent connection-scoped state. Set on connect(), torn down on
  // close() or drop. The decoder retains its byte buffer across sends
  // — this is what makes late-ACK-after-timeout land cleanly on the
  // next send (and trip the correlation check).
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #decoder: FrameDecoder | null = null;
  #pendingFrames: Uint8Array[] = [];
  #frameWaiter: FrameWaiter | null = null;
  // Race recovery: dispatchError may fire between writer.write() and
  // #waitForFrame's waiter registration. Stash the error here so the
  // imminent send.#waitForFrame call surfaces it instead of hanging.
  #pendingError: Error | null = null;

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
    return this.#state;
  }

  /** True when ready or sending — i.e., the wire is up. */
  get connected(): boolean {
    return this.#state === "ready" || this.#state === "sending";
  }

  /**
   * Number of sends waiting in the queue, excluding the one currently on the
   * wire. Fire three concurrent sends on a ready client and this reads `2`.
   */
  get queueDepth(): number {
    return this.#queue.length;
  }

  async connect(opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.#state === "closed" || this.#state === "closing") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot connect: this client is ${this.#state} — it has been closed. Construct a new MllpClient to open a fresh connection.`
      );
    }
    if (this.#state !== "idle") {
      throw new MllpClientError(
        MllpErrorCode.ALREADY_CONNECTED,
        `Cannot connect while ${this.#state}: an MllpClient opens one connection in its lifetime. Await the in-flight connect, or use a separate client for a concurrent connection.`
      );
    }
    this.#state = "connecting";

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
      this.#state = "closed";
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

    // Close-during-connect race. We set #state = "connecting" before the
    // `await` above; an `await` is a yield point, so a concurrent close() can
    // run while we are suspended. Re-check that invariant rather than test for
    // one specific state: anything other than "connecting" means we were
    // superseded (close() advances to "closing"/"closed"; a future state would
    // land here too). "ready" is impossible — it is set only below, after this
    // guard. Because close() ran while #duplex was still null (it is assigned
    // just below — the commit point), it could not have torn down the socket
    // the adapter just returned. We now own that orphaned, open duplex: close
    // it to avoid a leak, then surface CONNECT_ABORTED.
    if (this.#state !== "connecting") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        `Connect to ${this.#host}:${this.#port} was interrupted: close() was called while the connection was still being established.`
      );
    }

    this.#duplex = duplex;
    this.#decoder = createFrameDecoder(
      this.#maxBufferedBytes === undefined
        ? undefined
        : { maxBufferedBytes: this.#maxBufferedBytes }
    );
    this.#reader = duplex.readable.getReader();
    this.#state = "ready";
    void this.#runReadLoop(duplex);
    void this.#watchForDrop(duplex);
  }

  async #watchForDrop(duplex: MllpDuplex): Promise<void> {
    await duplex.closed;
    if (this.#closingExplicit) {
      return;
    }
    if (this.#duplex === duplex) {
      this.#dispatchError(
        new MllpClientError(
          MllpErrorCode.DROPPED,
          `The peer at ${this.#host}:${this.#port} closed the connection.`,
          {
            reason: "peer-drop",
          }
        )
      );
    }
  }

  /**
   * Persistent read loop. Runs from `connect()` until the duplex
   * closes or the decoder errors. Each emitted frame goes to a waiting
   * `send()` if one exists, otherwise queues for the next send to
   * pick up — that's what lets late ACKs after a timeout still trip
   * the correlation check.
   */
  async #runReadLoop(duplex: MllpDuplex): Promise<void> {
    const reader = this.#reader;
    const decoder = this.#decoder;
    if (reader === null || decoder === null) {
      return;
    }
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (this.#duplex !== duplex) {
          return;
        }
        if (done) {
          // #watchForDrop is awaiting duplex.closed and will dispatch
          // the peer-drop error. Just exit the loop.
          return;
        }
        const error = decoder.push(chunk, (decoded) => {
          this.#dispatchFrame(decoded);
        });
        if (error) {
          // Decoder errors are terminal (its buffer state becomes
          // undefined). Surface as DROPPED with a `framing-error` reason —
          // one "connection unrecoverable" code, discriminated by reason.
          this.#dispatchError(
            new MllpClientError(MllpErrorCode.DROPPED, error.message, {
              cause: error,
              reason: "framing-error",
            })
          );
          return;
        }
      }
    } catch {
      // reader.read() rejected — close() released the lock or the
      // underlying stream errored. #watchForDrop or close() owns the
      // teardown; nothing to do here.
    }
  }

  #dispatchFrame(bytes: Uint8Array): void {
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.resolve(bytes);
      return;
    }
    if (this.#pendingFrames.length >= MAX_PENDING_FRAMES) {
      // Peer has flooded us with unsolicited frames — terminal.
      this.#dispatchError(
        new MllpClientError(
          MllpErrorCode.DROPPED,
          `The peer sent more than ${MAX_PENDING_FRAMES} unsolicited frames with no matching request; closing the connection to avoid unbounded buffering.`,
          { reason: "frame-queue-overflow" }
        )
      );
      return;
    }
    this.#pendingFrames.push(bytes);
  }

  /**
   * A stream-level error is terminal: the decoder's buffer state is
   * undefined after a framing error, write failures imply a dead socket,
   * and a peer that's sending garbage isn't going to recover. Transition
   * to "closed" so subsequent sends fail fast with CLOSED instead of
   * writing into a dead wire and hanging until sendTimeoutMs.
   */
  #dispatchError(error: Error): void {
    const waiter = this.#frameWaiter;
    this.#frameWaiter = null;
    if (this.#state === "ready" || this.#state === "sending") {
      this.#state = "closed";
      const duplex = this.#duplex;
      this.#duplex = null;
      this.#decoder = null;
      this.#reader = null;
      this.#pendingFrames = [];
      // "ended", not "dropped": these sends reject with code CLOSED (they
      // never reached the wire), so the message stays in the CLOSED vocabulary
      // rather than borrowing DROPPED's (first-principle #6: disjoint codes).
      this.#failQueue(
        "The connection ended before this queued send reached the wire; it was not transmitted."
      );
      if (duplex) {
        // Fire-and-forget — adapter contract guarantees close() resolves.
        void duplex.close();
      }
    }
    if (waiter) {
      waiter.reject(error);
    } else {
      // No waiter to reject — but a send may be mid-flight and about
      // to call #waitForFrame. Stash so it doesn't hang.
      this.#pendingError = error;
    }
  }

  // `async` keeps the Promise contract: the synchronous guard and toWireFrame()
  // failures below surface as rejections, never as synchronous throws — which
  // is what callers (and the tests) rely on. No `await` is needed in the body.
  // oxlint-disable-next-line eslint/require-await
  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    if (this.#state === "closing" || this.#state === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot send: this client is ${this.#state} — it has been closed. Construct a new MllpClient to send again.`
      );
    }
    if (this.#state !== "ready" && this.#state !== "sending") {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${this.#state}, not connected. Call connect() before send().`
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
    if (this.#draining || this.#state !== "ready") {
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
      while (this.#queue.length > 0 && this.#state === "ready") {
        const task = this.#queue.shift();
        if (task === undefined) {
          return;
        }
        task.detachQueuedAbort();
        this.#state = "sending";
        try {
          const result = await this.#processSend(task);
          task.clearDeadline();
          task.resolve(result);
        } catch (error) {
          task.clearDeadline();
          // Slowloris recovery: on send timeout with a mid-frame decoder
          // buffer, reset it so the next send isn't corrupted by the
          // partial. A complete late ACK would already have been emitted
          // (buffered === 0).
          if (
            error instanceof MllpClientError &&
            error.code === MllpErrorCode.SEND_TIMEOUT &&
            this.#decoder !== null &&
            this.#decoder.buffered > 0
          ) {
            this.#decoder.reset();
          }
          task.reject(error as Error);
        }
        // Restore "ready" only if the wire is still up; a drop/close during
        // the send advanced state already (and failed the rest of the queue).
        if (this.#state === "sending") {
          this.#state = this.#duplex === null ? "closed" : "ready";
        }
      }
    } finally {
      this.#draining = false;
    }
  }

  /**
   * Reject every still-queued send (those not yet on the wire). The on-wire
   * send, if any, is rejected separately via {@link #frameWaiter}. Called when
   * the connection ends: a queued send was never dispatched, so it fails with
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

  async #processSend(task: QueuedSend): Promise<MllpClientResponse> {
    const duplex = this.#duplex;
    if (duplex === null) {
      // Unreachable from "ready"/"sending" by construction — assert with a
      // typed error so a future invariant break is loud.
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        "Internal: duplex is null while sending"
      );
    }
    const sentMonotonic = performance.now();

    // Write the frame. Lock acquisition / release is bracketed.
    const writer = duplex.writable.getWriter();
    try {
      await writer.write(task.framed);
    } catch (error) {
      // Write failure is terminal — the socket half is dead. Mark closed so
      // subsequent sends fail fast with CLOSED, and throw DROPPED (reason
      // `write-failed`) with the original cause for triage.
      const dropped = new MllpClientError(
        MllpErrorCode.DROPPED,
        `Failed to write the framed message to ${this.#host}:${this.#port}; the connection is no longer usable (see the error's cause).`,
        { cause: error, reason: "write-failed" }
      );
      this.#dispatchError(dropped);
      throw dropped;
    } finally {
      writer.releaseLock();
    }

    // Wait for the next frame from the persistent read loop. The
    // decoder retains its buffer across sends, so a late ACK from a
    // previously-timed-out request will land here and be checked by
    // correlation.
    const ackBytes = await this.#waitForFrame(task);

    const timestamp = new Date();
    const durationMs = performance.now() - sentMonotonic;

    return parseResponse({
      durationMs,
      raw: ackBytes,
      requestControlId: task.requestControlId,
      timestamp,
    });
  }

  #waitForFrame(task: QueuedSend): Promise<Uint8Array> {
    // A stream-level error fired between writer.write() and this
    // registration — surface it instead of waiting on a dead stream.
    if (this.#pendingError !== null) {
      const error = this.#pendingError;
      this.#pendingError = null;
      return Promise.reject(error);
    }
    // Drain a previously-queued frame first.
    const queued = this.#pendingFrames.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    const { abortSignal, deadlineSignal, timeoutMs } = task;

    // oxlint-disable-next-line promise/avoid-new -- canonical waiter wrapper
    return new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = () => {
        // Detach ourselves so the read loop doesn't try to resolve us
        // after the fact.
        if (this.#frameWaiter === waiter) {
          this.#frameWaiter = null;
        }
        reject(sendAbortError(deadlineSignal, timeoutMs));
      };

      const waiter: FrameWaiter = {
        reject: (error) => {
          abortSignal.removeEventListener("abort", onAbort);
          reject(error);
        },
        resolve: (bytes) => {
          abortSignal.removeEventListener("abort", onAbort);
          resolve(bytes);
        },
      };

      this.#frameWaiter = waiter;
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async close(): Promise<void> {
    if (this.#state === "closed" || this.#state === "closing") {
      return;
    }
    if (this.#state === "idle") {
      this.#state = "closed";
      return;
    }

    this.#closingExplicit = true;
    this.#state = "closing";
    const duplex = this.#duplex;

    // Reject any in-flight waiter so send() doesn't hang. CLOSED (not
    // DROPPED) — the caller initiated this teardown.
    const closedError = new MllpClientError(
      MllpErrorCode.CLOSED,
      "close() was called while this message was still being sent, so the send did not complete. The message may or may not have reached the peer; if it is not safe to resend blindly, confirm receipt before retrying."
    );
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.reject(closedError);
    } else {
      // The on-wire send may be mid-write — between writer.write() and
      // #waitForFrame's waiter registration. Stash CLOSED in the same
      // race-recovery slot #dispatchError uses, so that send surfaces it
      // instead of registering a waiter on a torn-down client and hanging.
      this.#pendingError = closedError;
    }
    // Reject every queued send too — none of them will reach the wire.
    this.#failQueue("Client closed before this queued send was dispatched");

    // Release the reader's lock so duplex.close() can drain cleanly.
    // Spec-compliant adapters MAY reject pending read() with TypeError;
    // the read loop catches that and bails.
    if (this.#reader !== null) {
      try {
        this.#reader.releaseLock();
      } catch {
        // The read loop may have already released or rejected — fine.
      }
    }
    this.#reader = null;
    this.#decoder = null;
    this.#duplex = null;
    this.#pendingFrames = [];
    // NOTE: #pendingError is intentionally NOT cleared here — a mid-write
    // send still needs to read the CLOSED stashed above. The instance is
    // single-use, so a lingering value is never observed by a later send.

    if (duplex) {
      await duplex.close();
    }
    this.#state = "closed";
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

/**
 * The error a send rejects with when its combined abort signal fires:
 * `SEND_TIMEOUT` if the deadline elapsed, `SEND_ABORTED` if the caller's
 * signal aborted. Shared by the while-queued path and the on-wire waiter so
 * both report the same cause.
 */
function sendAbortError(deadlineSignal: AbortSignal, timeoutMs: number): Error {
  if (deadlineSignal.aborted) {
    return new MllpClientError(
      MllpErrorCode.SEND_TIMEOUT,
      `Timed out after ${timeoutMs}ms waiting for the peer to acknowledge the message (the deadline spans the queue wait and the wire round-trip).`,
      { timeoutMs }
    );
  }
  return new MllpClientError(
    MllpErrorCode.SEND_ABORTED,
    "Send aborted by the caller's abort signal before the ACK was received."
  );
}

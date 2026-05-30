/**
 * The `MllpClient` class — persistent, single-flight MLLP client for HL7v2.
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
 * frame here if a `send()` is waiting, otherwise queues it. Only one
 * waiter is active at a time (enforced by the `CONCURRENT_SEND`
 * guard).
 */
interface FrameWaiter {
  resolve(bytes: Uint8Array): void;
  reject(error: Error): void;
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

  async connect(opts: { signal?: AbortSignal } = {}): Promise<void> {
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

    // Close-during-connect race: while we were awaiting the adapter,
    // someone may have called close(). If so, state is no longer
    // "connecting" — we own the just-returned duplex, so close it and
    // surface CONNECT_ABORTED to the caller.
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

  async send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    if (this.#state === "sending") {
      throw new MllpClientError(
        MllpErrorCode.CONCURRENT_SEND,
        "A send is already in flight"
      );
    }
    if (this.#state === "closing" || this.#state === "closed") {
      throw new MllpClientError(
        MllpErrorCode.CLOSED,
        `Cannot send: this client is ${this.#state} — it has been closed. Construct a new MllpClient to send again.`
      );
    }
    if (this.#state !== "ready") {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: the client is ${this.#state}, not connected. Call connect() before send().`
      );
    }

    const duplex = this.#duplex;
    if (duplex === null) {
      // By construction this should be unreachable from state "ready" —
      // assert with a typed error so a future invariant break is loud.
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        "Internal: duplex is null while state is ready"
      );
    }

    // Build the wire bytes (caller bytes verbatim, or a serialized Root) and
    // read MSH-10 for correlation — both before any state mutation. Framing an
    // unframable payload throws FramingError here; reading MSH-10 is
    // best-effort and never blocks the send.
    const framed = toWireFrame(message);
    const requestControlId = readRequestControlId(message);

    this.#state = "sending";
    let result: MllpClientResponse;
    try {
      result = await this.#doSend(duplex, framed, requestControlId, {
        signal: opts.signal,
        timeoutMs: opts.timeoutMs ?? this.#sendTimeoutMs,
      });
    } catch (error) {
      // Slowloris recovery: on send timeout, if the decoder is mid-frame,
      // reset its buffer. A complete late ACK would already have been
      // emitted (buffered === 0); a partial frame (buffered > 0) is
      // garbage that would otherwise compound into FRAME_TOO_LARGE on
      // a later send.
      if (
        error instanceof MllpClientError &&
        error.code === MllpErrorCode.SEND_TIMEOUT &&
        this.#decoder !== null &&
        this.#decoder.buffered > 0
      ) {
        this.#decoder.reset();
      }
      // Only restore "ready" if the connection is still up. If the
      // drop watcher, close(), or #dispatchError already advanced state,
      // respect that.
      if (this.#state === "sending") {
        this.#state = this.#duplex === null ? "closed" : "ready";
      }
      throw error;
    }
    if (this.#state === "sending") {
      this.#state = "ready";
    }
    return result;
  }

  async #doSend(
    duplex: MllpDuplex,
    framed: Uint8Array,
    requestControlId: string,
    opts: {
      timeoutMs: number;
      signal: AbortSignal | undefined;
    }
  ): Promise<MllpClientResponse> {
    const sentMonotonic = performance.now();

    // Write the frame. Lock acquisition / release is bracketed.
    const writer = duplex.writable.getWriter();
    try {
      try {
        await writer.write(framed);
      } catch (error) {
        // Write failure is terminal — the socket half is dead. Mark
        // closed so subsequent sends fail fast with CLOSED, and throw
        // DROPPED (reason `write-failed`) with the original cause for triage.
        const dropped = new MllpClientError(
          MllpErrorCode.DROPPED,
          `Failed to write the framed message to ${this.#host}:${this.#port}; the connection is no longer usable (see the error's cause).`,
          { cause: error, reason: "write-failed" }
        );
        this.#dispatchError(dropped);
        throw dropped;
      }
    } finally {
      writer.releaseLock();
    }

    // Wait for the next frame from the persistent read loop. The
    // decoder retains its buffer across sends, so a late ACK from a
    // previously-timed-out request will land here and be checked by
    // correlation.
    const ackBytes = await this.#waitForFrame(opts.timeoutMs, opts.signal);

    const timestamp = new Date();
    const durationMs = performance.now() - sentMonotonic;

    return parseResponse({
      durationMs,
      raw: ackBytes,
      requestControlId,
      timestamp,
    });
  }

  #waitForFrame(
    timeoutMs: number,
    signal: AbortSignal | undefined
  ): Promise<Uint8Array> {
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

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signals: AbortSignal[] = [timeoutSignal];
    if (signal) {
      signals.push(signal);
    }
    const abortSignal = AbortSignal.any(signals);

    // oxlint-disable-next-line promise/avoid-new -- canonical waiter wrapper
    return new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = () => {
        // Detach ourselves so the read loop doesn't try to resolve us
        // after the fact.
        if (this.#frameWaiter === waiter) {
          this.#frameWaiter = null;
        }
        if (timeoutSignal.aborted) {
          reject(
            new MllpClientError(
              MllpErrorCode.SEND_TIMEOUT,
              `Send timed out after ${timeoutMs}ms`,
              { timeoutMs }
            )
          );
        } else {
          reject(
            new MllpClientError(
              MllpErrorCode.SEND_ABORTED,
              "Send aborted by caller signal"
            )
          );
        }
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
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.reject(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "Client closed during in-flight send"
        )
      );
    }

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
    this.#pendingError = null;

    if (duplex) {
      await duplex.close();
    }
    this.#state = "closed";
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

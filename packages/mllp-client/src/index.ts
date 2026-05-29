/**
 * `@glion/mllp-client` — persistent, single-flight MLLP client for HL7v2.
 *
 * One connection, one in-flight `send()`. NAK responses throw
 * {@link MllpRejectedError}. Concurrent `send()` rejects with
 * {@link MllpClientError} (code `CONCURRENT_SEND`); queueing lands in
 * Phase 4.
 *
 * Runtime adapters live behind {@link MllpConnector} — the default Node
 * adapter is in `@glion/mllp-client/node`.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { createFrameDecoder, frame, validate } from "@glion/mllp-transport";
import type { FrameDecoder } from "@glion/mllp-transport";
import { parseHL7v2 } from "@glion/parser";
import { value } from "@glion/util-query";

// ===========================================================================
// Codes
// ===========================================================================

/**
 * HL7v2 acknowledgment codes (MSA-1).
 *
 * - `AA` / `CA` — accept (application / commit).
 * - `AE` / `CE` — error (application / commit).
 * - `AR` / `CR` — reject (application / commit).
 *
 * `MllpClient.send()` resolves with `code` narrowed to {@link AcceptCode}
 * and throws {@link MllpRejectedError} with `code` narrowed to
 * {@link NakCode}.
 */
export const AckCode = {
  AA: "AA",
  AE: "AE",
  AR: "AR",
  CA: "CA",
  CE: "CE",
  CR: "CR",
} as const;
export type AckCode = (typeof AckCode)[keyof typeof AckCode];
export type AcceptCode = "AA" | "CA";
export type NakCode = "AE" | "AR" | "CE" | "CR";

// ===========================================================================
// Error codes
// ===========================================================================

export const MllpErrorCode = {
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
  CLOSED: "CLOSED",
  CONCURRENT_SEND: "CONCURRENT_SEND",
  CONNECT_ABORTED: "CONNECT_ABORTED",
  CONNECT_FAILED: "CONNECT_FAILED",
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  CORRELATION_MISMATCH: "CORRELATION_MISMATCH",
  DROPPED: "DROPPED",
  NOT_CONNECTED: "NOT_CONNECTED",
  PARSE_FAILED: "PARSE_FAILED",
  REJECTED: "REJECTED",
  SEND_ABORTED: "SEND_ABORTED",
  SEND_TIMEOUT: "SEND_TIMEOUT",
  UNKNOWN_ACK_CODE: "UNKNOWN_ACK_CODE",
  WRITE_FAILED: "WRITE_FAILED",
} as const;
export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

// ===========================================================================
// Errors
// ===========================================================================

export class MllpClientError<
  TCode extends string = MllpErrorCode,
> extends Error {
  readonly code: TCode;
  constructor(code: TCode, message: string, opts?: { cause?: unknown }) {
    super(message, opts);
    this.name = "MllpClientError";
    this.code = code;
  }
}

export class MllpConnectError extends MllpClientError {
  readonly host: string;
  readonly port: number;
  constructor(opts: { host: string; port: number; cause?: unknown }) {
    super(
      MllpErrorCode.CONNECT_FAILED,
      `Failed to connect to ${opts.host}:${opts.port}`,
      {
        cause: opts.cause,
      }
    );
    this.name = "MllpConnectError";
    this.host = opts.host;
    this.port = opts.port;
  }
}

export class MllpTimeoutError extends MllpClientError {
  readonly phase: "connect" | "send";
  readonly timeoutMs: number;
  constructor(phase: "connect" | "send", timeoutMs: number) {
    super(
      phase === "connect"
        ? MllpErrorCode.CONNECT_TIMEOUT
        : MllpErrorCode.SEND_TIMEOUT,
      `${phase === "connect" ? "Connect" : "Send"} timed out after ${timeoutMs}ms`
    );
    this.name = "MllpTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Why a connection ended. Lets the caller branch on cause without
 * parsing the message string.
 */
export type MllpDropReason =
  | "peer-drop"
  | "stream-ended"
  | "framing-error"
  | "frame-queue-overflow"
  | "write-failed";

/**
 * The peer or the transport ended the connection while a send was
 * waiting for an ACK (peer FIN, RST, transport error, decoder error,
 * write failure). Distinct from `MllpClientError(CLOSED)`, which is
 * thrown when the caller has already closed the client.
 */
export class MllpDroppedError extends MllpClientError {
  readonly reason: MllpDropReason;
  constructor(
    reason: MllpDropReason,
    message = defaultDropMessage(reason),
    opts?: { cause?: unknown }
  ) {
    super(MllpErrorCode.DROPPED, message, opts);
    this.name = "MllpDroppedError";
    this.reason = reason;
  }
}

function defaultDropMessage(reason: MllpDropReason): string {
  switch (reason) {
    case "peer-drop": {
      return "Peer closed the connection";
    }
    case "stream-ended": {
      return "Stream ended before ACK received";
    }
    case "framing-error": {
      return "Decoder rejected peer bytes; connection unrecoverable";
    }
    case "frame-queue-overflow": {
      return "Peer flooded the client with unsolicited frames";
    }
    case "write-failed": {
      return "Write to socket failed; connection unrecoverable";
    }
    default: {
      return "Connection dropped";
    }
  }
}

export class MllpRejectedError extends MllpClientError<NakCode> {
  readonly controlId: string;
  readonly requestControlId: string;
  readonly tree: Root;
  readonly raw: Uint8Array;
  readonly timestamp: Date;
  readonly durationMs: number;
  constructor(opts: {
    code: NakCode;
    controlId: string;
    requestControlId: string;
    tree: Root;
    raw: Uint8Array;
    timestamp: Date;
    durationMs: number;
  }) {
    super(opts.code, `Peer rejected message with code ${opts.code}`);
    this.name = "MllpRejectedError";
    this.controlId = opts.controlId;
    this.requestControlId = opts.requestControlId;
    this.tree = opts.tree;
    this.raw = opts.raw;
    this.timestamp = opts.timestamp;
    this.durationMs = opts.durationMs;
  }
}

export class MllpCorrelationError extends MllpClientError {
  readonly expected: string;
  readonly actual: string;
  readonly tree: Root;
  readonly raw: Uint8Array;
  constructor(opts: {
    expected: string;
    actual: string;
    tree: Root;
    raw: Uint8Array;
  }) {
    super(
      MllpErrorCode.CORRELATION_MISMATCH,
      `Response controlId mismatch: expected "${opts.expected}", got "${opts.actual}"`
    );
    this.name = "MllpCorrelationError";
    this.expected = opts.expected;
    this.actual = opts.actual;
    this.tree = opts.tree;
    this.raw = opts.raw;
  }
}

// ===========================================================================
// Response
// ===========================================================================

export interface MllpClientResponse {
  /** MSA-1 (always {@link AcceptCode} — NAK throws). */
  readonly code: AcceptCode;
  /**
   * MSA-2 — correlation ID echoed by the peer. Empty if the peer
   * omitted it (some early-HL7 peers don't).
   */
  readonly controlId: string;
  /** MSH-10 of the request that this ACK responds to. */
  readonly requestControlId: string;
  /** Parsed AST of the ACK message. */
  readonly tree: Root;
  /** De-framed payload bytes. */
  readonly raw: Uint8Array;
  /** Wall-clock instant the ACK frame finished arriving. */
  readonly timestamp: Date;
  /** Wire-level round-trip duration (monotonic), milliseconds. */
  readonly durationMs: number;
}

// ===========================================================================
// Duplex adapter contract
// ===========================================================================

/**
 * Bidirectional byte stream contract that runtime adapters must satisfy.
 *
 * **Adapter responsibilities** (the client trusts these and does not
 * defend against violations — adapter tests enforce them):
 *
 * - `close()` MUST resolve (never reject) and MUST be idempotent. The client
 *   awaits `close()` in `finally` blocks and fires-and-forgets from abort
 *   handlers.
 * - `closed` MUST resolve when either side ends the connection (peer drop,
 *   explicit close, error). It must not reject.
 */
export interface MllpDuplex {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  readonly closed: Promise<void>;
}

export type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;

// ===========================================================================
// Client
// ===========================================================================

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
 * Strict UTF-8 decoder — throws on invalid bytes. HL7v2 messages SHOULD
 * be ASCII / UTF-8 in 2.x and later. Latin-1 / Windows-1252 peers will
 * fail PARSE_FAILED rather than silently substitute U+FFFD.
 */
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

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
        `Cannot connect: state is "${this.#state}"`
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
          "Connect aborted by caller signal",
          { cause: error }
        );
      }
      if (timeoutSignal.aborted) {
        throw new MllpTimeoutError("connect", this.#connectTimeoutMs);
      }
      throw new MllpConnectError({
        cause: error,
        host: this.#host,
        port: this.#port,
      });
    }

    // Close-during-connect race: while we were awaiting the adapter,
    // someone may have called close(). If so, state is no longer
    // "connecting" — we own the just-returned duplex, so close it and
    // surface CONNECT_ABORTED to the caller.
    if (this.#state !== "connecting") {
      await duplex.close();
      throw new MllpClientError(
        MllpErrorCode.CONNECT_ABORTED,
        "Connect interrupted by close()"
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
      this.#dispatchError(new MllpDroppedError("peer-drop"));
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
          // undefined). Wrap as a MllpDroppedError so the user sees
          // one error class for "connection unrecoverable" with a
          // reason discriminator.
          this.#dispatchError(
            new MllpDroppedError("framing-error", error.message, {
              cause: error,
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
      this.#dispatchError(new MllpDroppedError("frame-queue-overflow"));
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
    message: string | Uint8Array,
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
        `Cannot send: client is "${this.#state}"`
      );
    }
    if (this.#state !== "ready") {
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        `Cannot send: state is "${this.#state}"`
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

    // Validate payload before any state mutation — invalid input
    // shouldn't leave the client stuck in "sending".
    validate(message);
    const requestControlId = extractMshControlId(message);

    this.#state = "sending";
    let result: MllpClientResponse;
    try {
      result = await this.#doSend(duplex, message, requestControlId, {
        maxBufferedBytes: this.#maxBufferedBytes,
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
        error instanceof MllpTimeoutError &&
        error.phase === "send" &&
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
    message: string | Uint8Array,
    requestControlId: string,
    opts: {
      timeoutMs: number;
      signal: AbortSignal | undefined;
      maxBufferedBytes: number | undefined;
    }
  ): Promise<MllpClientResponse> {
    const framed = frame(message);
    const sentMonotonic = performance.now();

    // Write the frame. Lock acquisition / release is bracketed.
    const writer = duplex.writable.getWriter();
    try {
      try {
        await writer.write(framed);
      } catch (error) {
        // Write failure is terminal — the socket half is dead. Mark
        // closed so subsequent sends fail fast with CLOSED, and throw
        // a MllpDroppedError with the original cause for triage.
        const dropped = new MllpDroppedError(
          "write-failed",
          "Failed to write frame to socket",
          { cause: error }
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
          reject(new MllpTimeoutError("send", timeoutMs));
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

// ===========================================================================
// Response parsing
// ===========================================================================

interface ParseInput {
  readonly raw: Uint8Array;
  readonly timestamp: Date;
  readonly durationMs: number;
  readonly requestControlId: string;
}

function parseResponse(input: ParseInput): MllpClientResponse {
  const { raw, timestamp, durationMs, requestControlId } = input;
  const text = TEXT_DECODER.decode(raw);

  let tree: Root;
  try {
    tree = parseHL7v2(text);
  } catch (error) {
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "Failed to parse ACK as HL7v2",
      { cause: error }
    );
  }

  const codeRaw = readValue(tree, "MSA-1[1].1.1");
  if (codeRaw === null || codeRaw === "") {
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "Response has no MSA-1 (acknowledgment code)"
    );
  }
  if (!isAckCode(codeRaw)) {
    throw new MllpClientError(
      MllpErrorCode.UNKNOWN_ACK_CODE,
      `Unknown acknowledgment code "${codeRaw}"; expected AA / AE / AR / CA / CE / CR`
    );
  }

  const controlId = readValue(tree, "MSA-2[1].1.1") ?? "";

  // Correlation: only reject if both sides have non-empty IDs and they
  // disagree. Empty response-side controlId is real-world compat (some
  // older peers don't echo MSA-2).
  if (
    requestControlId !== "" &&
    controlId !== "" &&
    requestControlId !== controlId
  ) {
    throw new MllpCorrelationError({
      actual: controlId,
      expected: requestControlId,
      raw,
      tree,
    });
  }

  if (
    codeRaw === "AE" ||
    codeRaw === "AR" ||
    codeRaw === "CE" ||
    codeRaw === "CR"
  ) {
    throw new MllpRejectedError({
      code: codeRaw,
      controlId,
      durationMs,
      raw,
      requestControlId,
      timestamp,
      tree,
    });
  }

  return {
    code: codeRaw,
    controlId,
    durationMs,
    raw,
    requestControlId,
    timestamp,
    tree,
  };
}

// ===========================================================================
// Module-internal helpers
// ===========================================================================

function isAckCode(s: string): s is AckCode {
  return (
    s === "AA" ||
    s === "AE" ||
    s === "AR" ||
    s === "CA" ||
    s === "CE" ||
    s === "CR"
  );
}

function readValue(tree: Root, path: string): string | null {
  const result = value(tree, path);
  if (result === null) {
    return null;
  }
  return result.value;
}

const MSH_SCAN_LIMIT = 1024;

/**
 * Extract MSH-10 (message control ID) by scanning the MSH segment. Avoids a
 * full HL7v2 parse on every send — we only need one field, and the request
 * might not even be syntactically valid HL7v2 (the client doesn't enforce
 * that, only that the bytes are framable).
 *
 * Returns `""` if the message doesn't begin with `MSH|…` or has fewer than
 * 10 fields. The send proceeds (real-world peers tolerate weird inputs)
 * but correlation verification will then be skipped.
 *
 * Scans only the first {@link MSH_SCAN_LIMIT} bytes — the MSH segment is
 * always the first segment and never that long. Multi-MB payloads stay
 * cheap. If a caller manages to push MSH-10 past byte 1024 with absurdly
 * long segments before it, correlation will be skipped — a degenerate
 * case we accept rather than scan the whole payload on every send.
 */
function extractMshControlId(message: string | Uint8Array): string {
  const text =
    typeof message === "string" ? message : TEXT_DECODER.decode(message);
  const slice =
    text.length > MSH_SCAN_LIMIT ? text.slice(0, MSH_SCAN_LIMIT) : text;
  const firstLineEnd = slice.search(/[\r\n]/);
  const firstLine = firstLineEnd === -1 ? slice : slice.slice(0, firstLineEnd);
  if (!firstLine.startsWith("MSH")) {
    return "";
  }
  const fields = firstLine.split("|");
  // MSH | encChars | sending | sendingFac | receiving | receivingFac
  // | datetime | security | messageType | controlId | …
  //   0      1         2        3            4           5
  //   6        7          8              9
  if (fields.length <= 9) {
    return "";
  }
  return fields[9] ?? "";
}

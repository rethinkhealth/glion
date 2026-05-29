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
 * The peer or the transport ended the connection while a send was
 * waiting for an ACK (peer FIN, RST, transport error). Distinct from
 * `MllpClientError(CLOSED)`, which is thrown when the caller has
 * already closed the client.
 */
export class MllpDroppedError extends MllpClientError {
  constructor(message = "Connection dropped before ACK received") {
    super(MllpErrorCode.DROPPED, message);
    this.name = "MllpDroppedError";
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
const TEXT_DECODER = new TextDecoder("utf-8");

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
  #streamError: Error | null = null;

  constructor(opts: MllpClientOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#connect = opts.connect;
    this.#connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    this.#maxBufferedBytes = opts.maxBufferedBytes;
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
      this.#state = "closed";
      this.#tearDownConnection();
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
      let stopped = false;
      while (!stopped) {
        const { done, value: chunk } = await reader.read();
        if (this.#duplex !== duplex) {
          // We've moved on (close or drop already cleaned up).
          return;
        }
        if (done) {
          // End-of-stream is reported as a drop via #watchForDrop, but
          // we also dispatch here in case the waiter was already
          // registered before the drop watcher fires.
          this.#dispatchError(new MllpDroppedError("Stream ended before ACK"));
          return;
        }
        const error = decoder.push(chunk, (decoded) => {
          this.#dispatchFrame(decoded);
        });
        if (error) {
          stopped = true;
          this.#dispatchError(error);
        }
      }
    } catch (error) {
      // reader.read() rejects if the lock is released or the stream
      // errors. Surface to any waiter.
      this.#dispatchError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  #dispatchFrame(bytes: Uint8Array): void {
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.resolve(bytes);
      return;
    }
    this.#pendingFrames.push(bytes);
  }

  #dispatchError(error: Error): void {
    // Stored so the next send (or in-flight send) surfaces it instead
    // of waiting forever.
    this.#streamError = error;
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.reject(error);
    }
  }

  #tearDownConnection(): void {
    this.#duplex = null;
    this.#decoder = null;
    this.#reader = null;
    this.#pendingFrames = [];
    this.#frameWaiter = null;
    this.#streamError = null;
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
      // Only restore "ready" if the connection is still up. If the
      // drop watcher or close() already advanced state, respect that.
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
        throw new MllpClientError(
          MllpErrorCode.WRITE_FAILED,
          "Failed to write frame to socket",
          { cause: error }
        );
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
    // Drain a previously-queued frame first.
    const queued = this.#pendingFrames.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    // A stream-level error landed before we asked — surface it.
    if (this.#streamError !== null) {
      const error = this.#streamError;
      this.#streamError = null;
      return Promise.reject(error);
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

    // Reject any in-flight waiter so send() doesn't hang.
    const waiter = this.#frameWaiter;
    if (waiter) {
      this.#frameWaiter = null;
      waiter.reject(new MllpDroppedError("Client closed during send"));
    }

    // Release the reader's lock so duplex.close() can drain cleanly.
    // Spec-compliant adapters MAY reject pending read() with TypeError;
    // the read loop catches that and tears down.
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
    this.#streamError = null;

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

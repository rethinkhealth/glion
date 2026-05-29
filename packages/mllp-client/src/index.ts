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
  constructor(message: string, opts?: { cause?: unknown }) {
    super(MllpErrorCode.CONNECT_FAILED, message, opts);
    this.name = "MllpConnectError";
  }
}

export class MllpTimeoutError extends MllpClientError {
  readonly timeoutMs: number;
  constructor(code: "CONNECT_TIMEOUT" | "SEND_TIMEOUT", timeoutMs: number) {
    super(
      code === "CONNECT_TIMEOUT"
        ? MllpErrorCode.CONNECT_TIMEOUT
        : MllpErrorCode.SEND_TIMEOUT,
      `${code === "CONNECT_TIMEOUT" ? "Connect" : "Send"} timed out after ${timeoutMs}ms`
    );
    this.name = "MllpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class MllpClosedError extends MllpClientError {
  constructor(message: string) {
    super(MllpErrorCode.DROPPED, message);
    this.name = "MllpClosedError";
  }
}

export class MllpRejectedError extends MllpClientError<NakCode> {
  readonly controlId: string;
  readonly tree: Root;
  readonly raw: Uint8Array;
  readonly timestamp: Date;
  readonly durationMs: number;
  constructor(opts: {
    code: NakCode;
    controlId: string;
    tree: Root;
    raw: Uint8Array;
    timestamp: Date;
    durationMs: number;
  }) {
    super(opts.code, `Peer rejected message with code ${opts.code}`);
    this.name = "MllpRejectedError";
    this.controlId = opts.controlId;
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
   * MSA-2 — correlation ID (echoes the request's MSH-10). Empty if peer
   * omitted.
   */
  readonly controlId: string;
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
 *   awaits `close()` in finally blocks and fires-and-forgets from abort
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
   * Maximum bytes buffered while decoding the ACK frame. Defence against
   * peers that send unterminated data. Default 16 MiB.
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
        throw new MllpTimeoutError("CONNECT_TIMEOUT", this.#connectTimeoutMs);
      }
      throw new MllpConnectError(
        `Failed to connect to ${this.#host}:${this.#port}`,
        { cause: error }
      );
    }

    this.#duplex = duplex;
    this.#state = "ready";
    void this.#watchForDrop(duplex);
  }

  async #watchForDrop(duplex: MllpDuplex): Promise<void> {
    await duplex.closed;
    if (this.#closingExplicit) {
      return;
    }
    if (this.#duplex === duplex) {
      this.#duplex = null;
      this.#state = "closed";
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
      throw new MllpClientError(
        MllpErrorCode.NOT_CONNECTED,
        "Internal: duplex is null while state is ready"
      );
    }

    // Validate payload before we mutate state — invalid input shouldn't
    // leave the client stuck in "sending".
    validate(message);
    const requestControlId = extractMshControlId(message);

    this.#state = "sending";
    let result: MllpClientResponse;
    try {
      result = await doSend(duplex, message, requestControlId, {
        maxBufferedBytes: this.#maxBufferedBytes,
        signal: opts.signal,
        timeoutMs: opts.timeoutMs ?? this.#sendTimeoutMs,
      });
    } catch (error) {
      // Only transition back to ready if no concurrent path (drop watcher,
      // close()) has moved state forward. If state is no longer "sending",
      // they own the transition and we don't clobber it.
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
    this.#duplex = null;
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
// Send pipeline — extracted from the class because it's `this`-less and
// easier to reason about as a sequence of pure-ish steps.
// ===========================================================================

interface DoSendOptions {
  readonly timeoutMs: number;
  readonly signal: AbortSignal | undefined;
  readonly maxBufferedBytes: number | undefined;
}

async function doSend(
  duplex: MllpDuplex,
  message: string | Uint8Array,
  requestControlId: string,
  opts: DoSendOptions
): Promise<MllpClientResponse> {
  const framed = frame(message);
  const sentMonotonic = performance.now();

  await writeFrame(duplex, framed);
  const ackBytes = await readAckFrame(duplex, opts);

  const timestamp = new Date();
  const durationMs = performance.now() - sentMonotonic;

  return parseResponse({
    durationMs,
    raw: ackBytes,
    requestControlId,
    timestamp,
  });
}

async function writeFrame(
  duplex: MllpDuplex,
  framed: Uint8Array
): Promise<void> {
  const writer = duplex.writable.getWriter();
  try {
    await writer.write(framed);
  } catch (error) {
    safeReleaseWriter(writer);
    throw new MllpClientError(
      MllpErrorCode.WRITE_FAILED,
      "Failed to write frame to socket",
      { cause: error }
    );
  }
  writer.releaseLock();
}

function safeReleaseWriter(
  writer: WritableStreamDefaultWriter<Uint8Array>
): void {
  try {
    writer.releaseLock();
  } catch {
    // Writer may already be released if the stream errored.
  }
}

async function readAckFrame(
  duplex: MllpDuplex,
  opts: DoSendOptions
): Promise<Uint8Array> {
  const reader = duplex.readable.getReader();
  const decoder = createFrameDecoder(
    opts.maxBufferedBytes === undefined
      ? undefined
      : { maxBufferedBytes: opts.maxBufferedBytes }
  );

  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs);
  const signals: AbortSignal[] = [timeoutSignal];
  if (opts.signal) {
    signals.push(opts.signal);
  }
  const abortSignal = AbortSignal.any(signals);

  const result = deferred<Uint8Array>();

  const onAbort = () => {
    if (timeoutSignal.aborted) {
      result.reject(new MllpTimeoutError("SEND_TIMEOUT", opts.timeoutMs));
    } else {
      result.reject(
        new MllpClientError(
          MllpErrorCode.SEND_ABORTED,
          "Send aborted by caller signal"
        )
      );
    }
  };
  if (abortSignal.aborted) {
    onAbort();
  } else {
    abortSignal.addEventListener("abort", onAbort, { once: true });
  }

  void watchDrop(duplex, result);
  void readLoop(reader, decoder, result);

  try {
    return await result.promise;
  } finally {
    await safeCancelReader(reader);
  }
}

async function watchDrop(
  duplex: MllpDuplex,
  result: Deferred<Uint8Array>
): Promise<void> {
  await duplex.closed;
  result.reject(new MllpClosedError("Connection dropped before ACK received"));
}

async function readLoop(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: FrameDecoder,
  result: Deferred<Uint8Array>
): Promise<void> {
  try {
    let frameBytes: Uint8Array | null = null;
    while (frameBytes === null) {
      const next = await reader.read();
      if (next.done) {
        result.reject(new MllpClosedError("Stream ended before ACK received"));
        return;
      }
      const outcome = pushChunk(decoder, next.value);
      if (outcome.error !== null) {
        result.reject(outcome.error);
        return;
      }
      frameBytes = outcome.frame;
    }
    result.resolve(frameBytes);
  } catch (error) {
    result.reject(
      error instanceof Error
        ? error
        : new MllpClientError(MllpErrorCode.DROPPED, "Read failed", {
            cause: error,
          })
    );
  }
}

interface ChunkOutcome {
  readonly frame: Uint8Array | null;
  readonly error: Error | null;
}

function pushChunk(decoder: FrameDecoder, chunk: Uint8Array): ChunkOutcome {
  let firstFrame: Uint8Array | null = null;
  const onFrame = (f: Uint8Array): void => {
    if (firstFrame === null) {
      firstFrame = f;
    }
  };
  const error = decoder.push(chunk, onFrame);
  return { error, frame: firstFrame };
}

async function safeCancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Reader may already be cancelled or released; nothing actionable.
  }
  try {
    reader.releaseLock();
  } catch {
    // Already released by cancel() in some implementations.
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

  if (isNakCode(codeRaw)) {
    throw new MllpRejectedError({
      code: codeRaw,
      controlId,
      durationMs,
      raw,
      timestamp,
      tree,
    });
  }

  return {
    code: codeRaw,
    controlId,
    durationMs,
    raw,
    timestamp,
    tree,
  };
}

// ===========================================================================
// Module-internal helpers
// ===========================================================================

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolveFn!: (value: T) => void;
  let rejectFn!: (error: Error) => void;
  // oxlint-disable-next-line promise/avoid-new -- canonical Deferred wrapper
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, reject: rejectFn, resolve: resolveFn };
}

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

function isNakCode(s: AckCode): s is NakCode {
  return s === "AE" || s === "AR" || s === "CE" || s === "CR";
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
 */
function extractMshControlId(message: string | Uint8Array): string {
  const text =
    typeof message === "string" ? message : TEXT_DECODER.decode(message);
  // First segment terminator is at the first CR / LF; the MSH segment is
  // the first ~150 bytes typically. Slice to keep this cheap even on
  // multi-MB messages.
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

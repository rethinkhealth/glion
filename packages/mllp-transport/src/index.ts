/**
 * MLLP byte-level framing primitives for HL7v2 messaging.
 *
 * Implements MLLP Release 1 (HL7v2 Transport Specification §2.3.1):
 * each message is wrapped in `<VT> payload <FS> <CR>`. MLLP Release 2
 * (length-prefixed) and HL7-over-HTTP are out of scope.
 *
 * Public surface:
 *
 * - {@link validate} — pre-flight check on outgoing payloads.
 * - {@link frame} — wrap a payload in the MLLP envelope (one-shot encoder).
 * - {@link decode} — strict one-shot decoder for a single complete frame.
 * - {@link createFrameDecoder} — streaming decoder for socket reads.
 * - {@link FrameDecoderStream} — Web Streams wrapper around the streaming
 *   decoder.
 * - {@link FramingError} + {@link FramingErrorCode} — typed failures.
 *
 * @module
 */

// ===========================================================================
// Byte constants
// ===========================================================================

/** Start-of-block marker. HL7v2 §2.3.1 calls this `<SB>` (Vertical Tab, 0x0B). */
export const VT = 0x0b;
/** End-of-block marker. HL7v2 §2.3.1 calls this `<EB>` (File Separator, 0x1C). */
export const FS = 0x1c;
/**
 * End-of-data marker (Carriage Return, 0x0D). Always follows FS to
 * terminate a frame. CR may also appear inside a payload — HL7v2
 * uses it as the segment terminator.
 */
export const CR = 0x0d;

// ===========================================================================
// Errors
// ===========================================================================

/**
 * Machine-readable codes for framing failures. Each code is mutually
 * exclusive; a caller's `switch` on `code` never needs context to
 * disambiguate.
 */
export const FramingErrorCode = {
  EMBEDDED_CONTROL_CHAR: "EMBEDDED_CONTROL_CHAR",
  FRAME_TOO_LARGE: "FRAME_TOO_LARGE",
  MISSING_END_BLOCK: "MISSING_END_BLOCK",
  MISSING_START_BLOCK: "MISSING_START_BLOCK",
} as const;

export type FramingErrorCode =
  (typeof FramingErrorCode)[keyof typeof FramingErrorCode];

export class FramingError extends Error {
  readonly code: FramingErrorCode;

  constructor(code: FramingErrorCode, message: string) {
    super(message);
    this.name = "FramingError";
    this.code = code;
  }
}

// ===========================================================================
// Internals shared across encode / decode / streaming decode
// ===========================================================================

const TEXT = new TextEncoder();

function toBytes(p: Uint8Array | string): Uint8Array {
  return typeof p === "string" ? TEXT.encode(p) : p;
}

/**
 * Scan `buf[from..end)` for the first FS byte that is immediately
 * followed by CR. Returns the FS index, or -1 if no such pair fits in
 * the inspected range. Embedded FS bytes NOT followed by CR are
 * treated as payload content — matches the lenient behaviour of
 * Mirth Connect, HAPI, and other established MLLP receivers.
 */
function findFsCr(buf: Uint8Array, from: number, end: number): number {
  let cursor = from;
  while (cursor < end) {
    const i = buf.indexOf(FS, cursor);
    if (i === -1 || i >= end - 1) {
      return -1;
    }
    if (buf[i + 1] === CR) {
      return i;
    }
    cursor = i + 1;
  }
  return -1;
}

// ===========================================================================
// validate
// ===========================================================================

/**
 * Throw if `payload` contains a byte that would desynchronise the
 * receiver's decoder. VT (0x0B) and FS (0x1C) are framing markers
 * and must not appear inside the payload. CR (0x0D) is allowed —
 * HL7v2 uses it as the segment terminator.
 *
 * String input is UTF-8 encoded and validated against the resulting
 * bytes. For other character sets, encode upstream and pass a
 * `Uint8Array`.
 *
 * @throws {@link FramingError} With code `EMBEDDED_CONTROL_CHAR`.
 */
export function validate(payload: Uint8Array | string): void {
  const bytes = toBytes(payload);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    if (b === VT || b === FS) {
      throw new FramingError(
        FramingErrorCode.EMBEDDED_CONTROL_CHAR,
        `Payload contains a reserved framing byte (0x${b.toString(16).padStart(2, "0")}) at offset ${i}`
      );
    }
  }
}

// ===========================================================================
// frame — one-shot encoder
// ===========================================================================

/**
 * Validate `payload`, then return a fresh `Uint8Array` of
 * `<VT> payload <FS> <CR>`. One allocation, one write call at the
 * socket; no shared mutable state.
 *
 * @throws {@link FramingError} With code `EMBEDDED_CONTROL_CHAR`.
 */
export function frame(payload: Uint8Array | string): Uint8Array {
  validate(payload);
  const bytes = toBytes(payload);
  const out = new Uint8Array(bytes.length + 3);
  out[0] = VT;
  out.set(bytes, 1);
  out[bytes.length + 1] = FS;
  out[bytes.length + 2] = CR;
  return out;
}

// ===========================================================================
// decode — strict one-shot decoder
// ===========================================================================

/**
 * Decode exactly one complete MLLP frame and return its payload.
 *
 * The input MUST begin with VT and the first FS+CR pair found inside
 * MUST be the last two bytes of the input — `decode` rejects both
 * missing terminators and trailing bytes after a terminator. Embedded
 * FS bytes inside the payload (FS not followed by CR) are accepted
 * as payload content.
 *
 * @throws {@link FramingError} On any structural violation.
 */
export function decode(input: Uint8Array): Uint8Array {
  if (input.length === 0 || input[0] !== VT) {
    throw new FramingError(
      FramingErrorCode.MISSING_START_BLOCK,
      "Input does not begin with VT (0x0B)"
    );
  }
  const fsIndex = findFsCr(input, 1, input.length);
  if (fsIndex === -1 || fsIndex !== input.length - 2) {
    throw new FramingError(
      FramingErrorCode.MISSING_END_BLOCK,
      "Input does not terminate with FS+CR (0x1C 0x0D) at end"
    );
  }
  return input.slice(1, fsIndex);
}

// ===========================================================================
// createFrameDecoder — streaming decoder
// ===========================================================================

export interface FrameDecoder {
  /**
   * Push a chunk of bytes from the wire. Emits each complete frame
   * via `onFrame` as it's extracted. Returns `null` on success or a
   * {@link FramingError} on structural violation. Frames emitted via
   * `onFrame` before the error are NOT lost.
   *
   * After an error the decoder's buffer state is undefined — call
   * {@link reset} before pushing fresh data, or discard the decoder.
   *
   * `onFrame` MUST NOT throw; if it does, the exception propagates
   * out of `push` and leaves the decoder in an inconsistent state.
   */
  push(
    chunk: Uint8Array,
    onFrame: (frame: Uint8Array) => void
  ): FramingError | null;

  /** Bytes currently held for an in-progress frame. */
  readonly buffered: number;

  /** Discard all buffered bytes. Safe to call any time. */
  reset(): void;
}

export interface FrameDecoderOptions {
  /**
   * Maximum bytes the decoder will buffer for an in-progress frame
   * before rejecting with `FRAME_TOO_LARGE`. Defence against a peer
   * that sends VT and never terminates the frame.
   *
   * @default 16777216 (16 MiB)
   */
  readonly maxBufferedBytes?: number;
}

const DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
const INITIAL_CAPACITY = 64;

/**
 * Create a stateful, push-based decoder for socket reads.
 *
 * ## How it works
 *
 * The decoder owns two fields captured in the closure:
 *
 * - `buffer` — a `Uint8Array` holding bytes received but not yet emitted as a
 *   complete frame. Grows by doubling, never shrinks.
 * - `length` — the logical byte count in `buffer[0..length)`. Always ≤
 *   `buffer.length`; bytes at `buffer[length..]` are unused capacity, not data.
 *   We track this separately because typed arrays have fixed capacity, so we
 *   can't use `.length` to mean "current size" the way you would with `Array`.
 *
 * ## Invariant
 *
 * After every successful `push()`, `buffer[0..length)` either is
 * empty OR begins with VT. The decoder never holds "garbage between
 * frames": if the byte following an emitted frame isn't VT, `push`
 * returns `MISSING_START_BLOCK` immediately rather than waiting to
 * see what comes next. This keeps failure detection eager and the
 * scan loop's first check meaningful.
 *
 * ## Complexity
 *
 * Each `push(chunk)` does O(chunk.length + buffered) work — append,
 * scan forward, compact. Capacity grows by doubling, so N pushes
 * that buffer K bytes total amortise to O(N + K) work overall — the
 * same guarantee as `Vec::push` / `ArrayList.add`. Memory is bounded
 * by `maxBufferedBytes` (or the largest single frame ever buffered,
 * rounded up to the next power of two).
 *
 * ## Frames are copied on emit
 *
 * `onFrame(frame)` receives a fresh `Uint8Array` via
 * `Uint8Array#slice`, not a `subarray` view. The buffer's underlying
 * `ArrayBuffer` is reused — a later `push` may overwrite those
 * bytes during compaction or replace the buffer entirely during
 * growth. A view would silently alias data we're about to clobber.
 * Copying makes the emitted frame independent and safe for the
 * consumer to retain across pushes.
 *
 * @example
 *   ```ts
 *   const decoder = createFrameDecoder();
 *   for await (const chunk of socket) {
 *     const err = decoder.push(chunk, handleFrame);
 *     if (err) throw err;
 *   }
 *   ```;
 */
export function createFrameDecoder(
  opts: FrameDecoderOptions = {}
): FrameDecoder {
  const max = opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  let buffer = new Uint8Array(0);
  let length = 0;

  return {
    get buffered() {
      return length;
    },

    push(chunk, onFrame) {
      // Empty chunks: some adapters yield a zero-byte read before
      // EOF (e.g. Node's `'data'` after `socket.end()` in some
      // edge cases). Treat as no-op so correct callers aren't
      // punished for a transport quirk.
      if (chunk.length === 0) {
        return null;
      }

      // Reject before allocating. A peer that sends VT followed by
      // an unterminated byte stream must not force a max-sized
      // allocation just to be told we'd reject.
      const needed = length + chunk.length;
      if (needed > max) {
        return new FramingError(
          FramingErrorCode.FRAME_TOO_LARGE,
          `Buffered ${length} + chunk ${chunk.length} exceeds maxBufferedBytes (${max})`
        );
      }

      // Doubling growth gives O(N) amortised total cost across N
      // appends (each byte is copied at most O(log N) times, and
      // the geometric series collapses to a constant factor).
      // Cap the capacity at `max`: with a small budget there's no
      // reason to over-allocate above the rejection threshold.
      if (needed > buffer.length) {
        let cap = buffer.length || INITIAL_CAPACITY;
        while (cap < needed) {
          cap *= 2;
        }
        const grown = new Uint8Array(Math.min(cap, max));
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(chunk, length);
      length += chunk.length;

      // Scan from offset 0 every push, not from a remembered
      // cursor. The previous push compacted the unparsed tail to
      // offset 0, so any stored offset would be stale. The scan
      // cost is bounded by `length`, which is bounded by `max`.
      let scan = 0;
      while (scan < length) {
        // By the post-push invariant, `buffer[scan]` is the first
        // byte of a candidate frame and MUST be VT. Anything else
        // is the peer writing garbage between frames — fail eagerly
        // here rather than buffering until the next FS+CR arrives.
        if (buffer[scan] !== VT) {
          return new FramingError(
            FramingErrorCode.MISSING_START_BLOCK,
            `Expected VT (0x0B) at offset ${scan}, got 0x${(buffer[scan] as number).toString(16).padStart(2, "0")}`
          );
        }

        // -1 means the FS+CR terminator is split across pushes (or
        // hasn't arrived yet). Break and resume on the next push,
        // when more bytes will be appended after the in-progress
        // frame's tail.
        const fsIndex = findFsCr(buffer, scan + 1, length);
        if (fsIndex === -1) {
          break;
        }

        // `slice` copies into a fresh ArrayBuffer; `subarray` would
        // alias bytes we're about to overwrite during compaction
        // (or free during growth). See the docblock for the full
        // story.
        onFrame(buffer.slice(scan + 1, fsIndex));
        scan = fsIndex + 2;
      }

      // Compact the unparsed tail back to offset 0 so the next
      // push appends contiguously. Two fast paths skip the memmove:
      //   * fully drained (scan >= length) — just reset length.
      //   * nothing parsed (scan === 0) — nothing to move.
      // Otherwise `copyWithin` runs an in-place memmove via the
      // engine's typed-array intrinsic — no alloc, no extra `set()`.
      if (scan >= length) {
        length = 0;
      } else if (scan > 0) {
        buffer.copyWithin(0, scan, length);
        length -= scan;
      }
      return null;
    },

    reset() {
      // Note: we don't shrink `buffer` here. A reset usually
      // follows an error, and the decoder is likely about to be
      // discarded anyway. If the caller reuses it, the existing
      // capacity is a free head-start for the next stream.
      length = 0;
    },
  };
}

// ===========================================================================
// FrameDecoderStream — Web Streams wrapper
// ===========================================================================

/**
 * Web Streams wrapper around {@link createFrameDecoder}. Pipe a
 * `ReadableStream<Uint8Array>` of socket chunks through this to get
 * a `ReadableStream<Uint8Array>` of complete frame payloads.
 *
 * Modelled on `TextDecoderStream` and `CompressionStream` from the
 * Web Streams standard. Framing errors surface as stream errors on
 * the readable side. When the writable side closes with bytes still
 * buffered for an incomplete frame, the stream errors with
 * `MISSING_END_BLOCK` — no silent data loss.
 *
 * @example
 *   ```ts
 *   for await (const frame of duplex.readable.pipeThrough(new FrameDecoderStream())) {
 *   handleFrame(frame);
 *   }
 *   ```;
 */
export class FrameDecoderStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor(opts?: FrameDecoderOptions) {
    const decoder = createFrameDecoder(opts);
    super({
      flush(controller) {
        if (decoder.buffered > 0) {
          controller.error(
            new FramingError(
              FramingErrorCode.MISSING_END_BLOCK,
              `Stream closed with ${decoder.buffered} bytes buffered for an incomplete frame`
            )
          );
        }
      },
      transform(chunk, controller) {
        const err = decoder.push(chunk, (f) => controller.enqueue(f));
        if (err) {
          controller.error(err);
        }
      },
    });
  }
}

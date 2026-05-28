/**
 * MLLP byte-level framing primitives.
 *
 * MLLP (Minimal Lower Layer Protocol) wraps each HL7v2 message in a
 * single-byte start marker (VT, 0x0B) and a two-byte terminator
 * (FS+CR, 0x1C 0x0D). This package ships the framing primitives —
 * constants, a one-shot decode, a streaming decoder, and a payload
 * validator. **It does not ship an `encode` function.** Callers that
 * need to write a frame to a socket compose three writes:
 *
 * ```ts
 * import { FRAME_START, FRAME_END, validate } from "@glion/mllp-transport";
 *
 * validate(payload);
 * await writer.write(FRAME_START);
 * await writer.write(payload);
 * await writer.write(FRAME_END);
 * ```
 *
 * The three-write pattern avoids copying the payload into a third
 * buffer. TCP coalesces the writes; the receiver sees one contiguous
 * stream.
 *
 * See HL7v2 Transport Specification §2.3.1.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Byte constants
// ---------------------------------------------------------------------------

/** Start-of-block marker (Vertical Tab, 0x0B). */
export const VT = 0x0b;
/** End-of-block marker (File Separator, 0x1C). */
export const FS = 0x1c;
/**
 * End-of-data marker (Carriage Return, 0x0D). Always follows FS to
 * terminate a frame. CR may also appear inside a payload — HL7v2
 * uses it as the segment terminator.
 */
export const CR = 0x0d;

/**
 * Shared one-byte buffer containing `[VT]`. Suitable for the first
 * write when streaming a frame to a socket. **Do not mutate** — the
 * buffer is shared across every caller in the process.
 */
export const FRAME_START: Uint8Array = new Uint8Array([VT]);

/**
 * Shared two-byte buffer containing `[FS, CR]`. Suitable for the
 * final write when streaming a frame to a socket. **Do not mutate.**
 */
export const FRAME_END: Uint8Array = new Uint8Array([FS, CR]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Machine-readable codes for framing failures. Each code is mutually
 * exclusive: a single failed call sets exactly one code, and a
 * caller's `switch` on `code` never needs context to disambiguate.
 */
export const MllpFramingErrorCode = {
  EMBEDDED_CONTROL_CHAR: "EMBEDDED_CONTROL_CHAR",
  MISSING_END_BLOCK: "MISSING_END_BLOCK",
  MISSING_START_BLOCK: "MISSING_START_BLOCK",
} as const;

export type MllpFramingErrorCode =
  (typeof MllpFramingErrorCode)[keyof typeof MllpFramingErrorCode];

/**
 * Error thrown by the codec for any structural framing failure. The
 * {@link code} field discriminates the failure mode.
 */
export class MllpFramingError extends Error {
  readonly code: MllpFramingErrorCode;

  constructor(code: MllpFramingErrorCode, message: string) {
    super(message);
    this.name = "MllpFramingError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

/**
 * Throw if `payload` contains a byte that would desynchronise the
 * receiver's decoder. VT (0x0B) and FS (0x1C) are framing markers and
 * must not appear inside the payload. CR (0x0D) is allowed — HL7v2
 * uses it as the segment terminator.
 *
 * String input is UTF-8 encoded and validated against the resulting
 * bytes.
 *
 * Throws {@link MllpFramingError} with code `EMBEDDED_CONTROL_CHAR`.
 */
export function validate(payload: Uint8Array | string): void {
  const bytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    if (b === VT || b === FS) {
      throw new MllpFramingError(
        MllpFramingErrorCode.EMBEDDED_CONTROL_CHAR,
        `Payload contains a reserved framing byte (0x${b.toString(16).padStart(2, "0")}) at offset ${i}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

/**
 * Decode exactly one complete MLLP frame and return its payload.
 *
 * The frame MUST begin with VT and end with FS+CR. The payload is
 * the bytes between (exclusive). The decoder is **lenient** about
 * payload content — embedded VT/FS bytes are returned as-is, and
 * downstream parsers will reject the resulting message.
 *
 * Throws {@link MllpFramingError} when the frame's envelope is
 * structurally invalid.
 */
export function decode(input: Uint8Array): Uint8Array {
  if (input.length === 0 || input[0] !== VT) {
    throw new MllpFramingError(
      MllpFramingErrorCode.MISSING_START_BLOCK,
      "Frame does not begin with VT (0x0B)"
    );
  }
  if (input.length < 3 || input.at(-2) !== FS || input.at(-1) !== CR) {
    throw new MllpFramingError(
      MllpFramingErrorCode.MISSING_END_BLOCK,
      "Frame does not end with FS+CR (0x1C 0x0D)"
    );
  }
  return input.slice(1, -2);
}

// ---------------------------------------------------------------------------
// FrameDecoder
// ---------------------------------------------------------------------------

/**
 * Stateful, push-based decoder for socket reads. Mirrors the shape
 * of `redis-parser` and `llhttp`: caller pushes chunks as they
 * arrive from the wire, the decoder returns the complete frames it
 * could extract.
 *
 * @example
 *   ```ts
 *   const decoder = new FrameDecoder();
 *   const reader = duplex.readable.getReader();
 *   while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   for (const frame of decoder.push(value)) {
 *   handleFrame(frame);
 *   }
 *   }
 *   ```
 *
 *   The decoder requires frames to be contiguous on the wire — the
 *   first byte after a frame's FS+CR terminator must be VT (start of
 *   the next frame) or the chunk must end there. Any other byte
 *   triggers `MISSING_START_BLOCK`.
 *
 *   Throws {@link MllpFramingError} on the first structural violation.
 *   The instance does not recover after a throw; construct a new
 *   decoder (or call {@link reset}) before processing further data.
 */
export class FrameDecoder {
  #buffer: Uint8Array = EMPTY;

  /**
   * Push a chunk of bytes; return all frames that completed as a
   * result. The returned array is empty when the chunk only
   * advanced a partially-buffered frame.
   */
  push(chunk: Uint8Array): Uint8Array[] {
    if (chunk.length === 0) {
      return [];
    }
    this.#buffer =
      this.#buffer.length === 0 ? chunk : concat(this.#buffer, chunk);

    const frames: Uint8Array[] = [];
    while (this.#buffer.length > 0) {
      const firstByte = this.#buffer[0] as number;
      if (firstByte !== VT) {
        throw new MllpFramingError(
          MllpFramingErrorCode.MISSING_START_BLOCK,
          `Expected VT (0x0B) at frame start, got 0x${firstByte.toString(16).padStart(2, "0")}`
        );
      }
      const fsIndex = this.#buffer.indexOf(FS, 1);
      if (fsIndex === -1) {
        break; // no terminator yet
      }
      if (fsIndex + 1 >= this.#buffer.length) {
        break; // FS found, waiting for CR
      }
      if (this.#buffer[fsIndex + 1] !== CR) {
        throw new MllpFramingError(
          MllpFramingErrorCode.MISSING_END_BLOCK,
          `FS (0x1C) at offset ${fsIndex} not followed by CR (0x0D)`
        );
      }
      frames.push(this.#buffer.slice(1, fsIndex));
      this.#buffer = this.#buffer.slice(fsIndex + 2);
    }
    return frames;
  }

  /** Bytes currently held for an in-progress frame. */
  get buffered(): number {
    return this.#buffer.length;
  }

  /** Drop any buffered partial-frame bytes. */
  reset(): void {
    this.#buffer = EMPTY;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const EMPTY = new Uint8Array(0);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

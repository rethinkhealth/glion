/**
 * MLLP byte-level framing codec.
 *
 * MLLP (Minimal Lower Layer Protocol) wraps each HL7v2 message in a
 * single-byte start marker (VT, 0x0B) and a two-byte terminator
 * (FS+CR, 0x1C 0x0D). The codec is pure: no streams, no sockets, no
 * classes — just bytes in, bytes out.
 *
 * See HL7v2 Transport Specification §2.3.1.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * MLLP framing markers. VT and FS are byte sentinels reserved for the
 * framing layer; the payload between them carries the HL7v2 message.
 */
// oxlint-disable-next-line sort-keys
export const MLLP = {
  /** Start-of-block marker (Vertical Tab, 0x0B). */
  VT: 0x0b,
  /** End-of-block marker (File Separator, 0x1C). */
  FS: 0x1c,
  /**
   * End-of-data marker (Carriage Return, 0x0D). Always follows FS to
   * terminate a frame. CR may also appear inside a payload — HL7v2
   * uses it as the segment terminator.
   */
  CR: 0x0d,
} as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Machine-readable codes for framing failures. Each code is mutually
 * exclusive: a single failed call sets exactly one code, and a
 * caller's `switch` on `code` never needs context to disambiguate.
 */
export const MllpFramingErrorCode = {
  /**
   * The payload contained a VT (0x0B) or FS (0x1C) byte. Both are
   * framing markers and forbidden inside a frame's content. Thrown
   * by {@link encode}. ({@link decodeOne} and {@link decodeStream}
   * are lenient — they don't double-check incoming content for these
   * bytes; downstream parsers will reject the resulting payload.)
   */
  EMBEDDED_CONTROL_CHAR: "EMBEDDED_CONTROL_CHAR",
  /**
   * No FS+CR terminator was found, or an FS was present but not
   * followed by CR. Thrown by {@link decodeOne} and
   * {@link decodeStream}.
   */
  MISSING_END_BLOCK: "MISSING_END_BLOCK",
  /**
   * The frame (or stream) did not begin with a VT byte. Thrown by
   * {@link decodeOne} and {@link decodeStream}.
   */
  MISSING_START_BLOCK: "MISSING_START_BLOCK",
} as const;

export type MllpFramingErrorCode =
  (typeof MllpFramingErrorCode)[keyof typeof MllpFramingErrorCode];

/**
 * Error thrown by the codec for any structural framing failure. The
 * {@link code} field discriminates the failure mode for typed
 * handling.
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
// encode
// ---------------------------------------------------------------------------

/**
 * Wrap an HL7v2 payload in the MLLP frame envelope
 * `<VT> payload <FS> <CR>`.
 *
 * String input is UTF-8 encoded. The payload must not contain VT
 * (0x0B) or FS (0x1C) — both are framing markers and would
 * desynchronise the receiver's decoder. CR (0x0D) IS allowed; HL7v2
 * uses it as the segment terminator inside the message body.
 *
 * Throws {@link MllpFramingError} with code `EMBEDDED_CONTROL_CHAR`
 * when validation fails.
 */
export function encode(payload: Uint8Array | string): Uint8Array {
  const bytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === MLLP.VT || b === MLLP.FS) {
      throw new MllpFramingError(
        MllpFramingErrorCode.EMBEDDED_CONTROL_CHAR,
        `Payload contains a reserved framing byte (0x${b.toString(16).padStart(2, "0")}) at offset ${i}`
      );
    }
  }

  const out = new Uint8Array(bytes.length + 3);
  out[0] = MLLP.VT;
  out.set(bytes, 1);
  out[out.length - 2] = MLLP.FS;
  out[out.length - 1] = MLLP.CR;
  return out;
}

// ---------------------------------------------------------------------------
// decodeOne
// ---------------------------------------------------------------------------

/**
 * Parse exactly one complete MLLP frame and return its payload.
 *
 * The frame MUST begin with VT and end with FS+CR. The payload is
 * the bytes between (exclusive). The decoder is **lenient** about
 * payload content — embedded VT/FS bytes are returned as-is, and
 * downstream parsers will reject the resulting message.
 *
 * Throws {@link MllpFramingError} when the frame's envelope is
 * structurally invalid.
 */
export function decodeOne(frame: Uint8Array): Uint8Array {
  if (frame.length === 0 || frame[0] !== MLLP.VT) {
    throw new MllpFramingError(
      MllpFramingErrorCode.MISSING_START_BLOCK,
      "Frame does not begin with VT (0x0B)"
    );
  }
  if (
    frame.length < 3 ||
    frame.at(-2) !== MLLP.FS ||
    frame.at(-1) !== MLLP.CR
  ) {
    throw new MllpFramingError(
      MllpFramingErrorCode.MISSING_END_BLOCK,
      "Frame does not end with FS+CR (0x1C 0x0D)"
    );
  }
  return frame.slice(1, -2);
}

// ---------------------------------------------------------------------------
// decodeStream
// ---------------------------------------------------------------------------

/**
 * Consume arbitrarily-chunked bytes and yield complete MLLP payloads
 * as frames arrive. Implemented as a sync generator so callers can
 * drive it from any iterable — a `for…of` over Node's `socket` async
 * iterator, a `ReadableStream` reader loop, an in-memory test fixture.
 *
 * Frames must be contiguous on the wire: the first byte after a
 * frame's FS+CR terminator must be VT (the next frame's start) or
 * end-of-input. Any other byte triggers `MISSING_START_BLOCK`.
 *
 * A frame can split across any chunk boundary, including between FS
 * and CR; the generator buffers internally until each frame
 * completes. Trailing incomplete bytes at end-of-input are dropped
 * silently — the consumer can detect this if they care by counting
 * yielded frames.
 *
 * Throws {@link MllpFramingError} as soon as a structural violation
 * is observed. The generator does not recover; callers must restart
 * the stream after handling.
 *
 * @yields Each complete frame's payload (the bytes between VT and FS).
 */
export function* decodeStream(
  chunks: Iterable<Uint8Array>
): Generator<Uint8Array, void, void> {
  let buffer: Uint8Array = EMPTY;

  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }
    buffer = buffer.length === 0 ? chunk : concat(buffer, chunk);

    while (buffer.length > 0) {
      const firstByte = buffer[0] as number;
      if (firstByte !== MLLP.VT) {
        throw new MllpFramingError(
          MllpFramingErrorCode.MISSING_START_BLOCK,
          `Expected VT (0x0B) at frame start, got 0x${firstByte.toString(16).padStart(2, "0")}`
        );
      }
      const fsIndex = buffer.indexOf(MLLP.FS, 1);
      if (fsIndex === -1) {
        // No terminator yet; wait for more bytes.
        break;
      }
      if (fsIndex + 1 >= buffer.length) {
        // FS found but no byte after it yet; wait for CR.
        break;
      }
      if (buffer[fsIndex + 1] !== MLLP.CR) {
        throw new MllpFramingError(
          MllpFramingErrorCode.MISSING_END_BLOCK,
          `FS (0x1C) at offset ${fsIndex} not followed by CR (0x0D)`
        );
      }
      yield buffer.slice(1, fsIndex);
      buffer = buffer.slice(fsIndex + 2);
    }
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

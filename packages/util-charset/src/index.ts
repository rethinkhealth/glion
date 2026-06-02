/** Error code for a payload whose bytes are not compatible with UTF-8. */
export const INCOMPATIBLE_CHARSET = "INCOMPATIBLE_CHARSET" as const;

/**
 * Thrown by {@link decodeBytes} when payload bytes cannot be read as UTF-8 —
 * either a non-UTF-8 byte-order mark (UTF-16/32) or otherwise-invalid UTF-8.
 * Carries `code === "INCOMPATIBLE_CHARSET"` so callers can branch on it.
 */
export class IncompatibleCharsetError extends Error {
  readonly code = INCOMPATIBLE_CHARSET;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IncompatibleCharsetError";
  }
}

/**
 * UTF-8 decoder. Fatal: malformed bytes throw rather than silently becoming the
 * U+FFFD replacement character — a silent substitution can change clinical
 * meaning (the failure behind issue #659). It also strips a leading UTF-8 BOM.
 */
const DECODER = new TextDecoder("utf-8", { fatal: true });

/** UTF-8 encoder (the only encoding the Web platform's `TextEncoder` emits). */
const ENCODER = new TextEncoder();

/**
 * Decode MLLP-de-framed HL7v2 payload bytes to text as UTF-8 — the decode step
 * the entries (server, client) own so the rest of the pipeline works in
 * strings.
 *
 * Only UTF-8 is supported for now (it is the HL7 2.x baseline and a strict
 * superset of 7-bit ASCII). Decoding is fatal, so a non-UTF-8 feed fails loudly
 * with an {@link IncompatibleCharsetError} instead of being silently corrupted.
 * Honouring the charset a message declares in MSH-18 (and other encodings) is
 * tracked in issue #662.
 *
 * @param bytes - The de-framed payload bytes.
 * @returns The decoded HL7v2 text.
 * @throws {IncompatibleCharsetError} When the bytes carry a non-UTF-8 BOM or are
 *   otherwise not valid UTF-8.
 */
export function decodeBytes(bytes: Uint8Array): string {
  rejectNonUtf8Bom(bytes);

  try {
    return DECODER.decode(bytes);
  } catch (error) {
    throw new IncompatibleCharsetError(
      "The HL7v2 payload is not valid UTF-8; only UTF-8 is supported.",
      { cause: error }
    );
  }
}

/**
 * Encode HL7v2 text to wire bytes as UTF-8.
 *
 * Only UTF-8 is supported for now; emitting other character sets for legacy
 * receivers is tracked in issue #662.
 *
 * @param text - The HL7v2 message text.
 * @returns The UTF-8 wire bytes.
 */
export function encodeBytes(text: string): Uint8Array {
  return ENCODER.encode(text);
}

/**
 * Guard: reject a payload that opens with a non-UTF-8 byte-order mark
 * (UTF-16/32) — it cannot be UTF-8. A UTF-8 BOM is compatible and left for the
 * decoder to strip.
 */
function rejectNonUtf8Bom(bytes: Uint8Array): void {
  const mark = nonUtf8Bom(bytes);
  if (mark) {
    throw new IncompatibleCharsetError(
      `The HL7v2 payload begins with a ${mark} byte-order mark; only UTF-8 is supported.`
    );
  }
}

/**
 * Detect a leading byte-order mark that declares a non-UTF-8 encoding,
 * returning its name. A UTF-8 BOM is compatible (the decoder strips it) and so
 * is ignored.
 *
 * Byte sequences are U+FEFF serialized in each form, per the Unicode FAQ
 * (https://www.unicode.org/faq/utf_bom.html): UTF-32BE `00 00 FE FF`, UTF-32LE
 * `FF FE 00 00`, UTF-16BE `FE FF`, UTF-16LE `FF FE`. UTF-32LE is tested before
 * UTF-16LE because `FF FE` is a prefix of `FF FE 00 00` — checking the 2-byte
 * mark first would misread a UTF-32LE BOM as UTF-16LE.
 */
function nonUtf8Bom(bytes: Uint8Array): string | undefined {
  const [b0, b1, b2, b3] = bytes;

  if (b0 === 0x00 && b1 === 0x00 && b2 === 0xfe && b3 === 0xff) {
    return "UTF-32BE";
  }
  if (b0 === 0xff && b1 === 0xfe && b2 === 0x00 && b3 === 0x00) {
    return "UTF-32LE";
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return "UTF-16BE";
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return "UTF-16LE";
  }

  return undefined;
}

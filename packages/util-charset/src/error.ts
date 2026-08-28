/**
 * Thrown by {@link decodeBytes} when payload bytes cannot be read as UTF-8 —
 * either a non-UTF-8 byte-order mark (UTF-16/32) or otherwise-invalid UTF-8.
 * Carries `code === "INCOMPATIBLE_CHARSET"` so callers can branch on it, and
 * owns the logic for describing why a payload is not UTF-8.
 */
export class CharsetError extends Error {
  readonly code = "INCOMPATIBLE_CHARSET";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CharsetError";
  }

  /**
   * Non-UTF-8 byte-order marks — U+FEFF serialized in each form, per the
   * Unicode FAQ (https://www.unicode.org/faq/utf_bom.html). Ordered
   * longest-first so the UTF-32LE mark `FF FE 00 00` matches before the
   * UTF-16LE mark `FF FE`, which is its prefix. (A UTF-8 BOM is compatible —
   * the decoder strips it.)
   */
  static readonly #nonUtf8Boms: ReadonlyArray<{
    encoding: string;
    mark: readonly number[];
  }> = [
    { encoding: "UTF-32BE", mark: [0x00, 0x00, 0xfe, 0xff] },
    { encoding: "UTF-32LE", mark: [0xff, 0xfe, 0x00, 0x00] },
    { encoding: "UTF-16BE", mark: [0xfe, 0xff] },
    { encoding: "UTF-16LE", mark: [0xff, 0xfe] },
  ];

  /**
   * Build a {@link CharsetError} for payload bytes that are not UTF-8, naming
   * the non-UTF-8 byte-order mark they open with when there is one. The fatal
   * decoder is what rejects the bytes; this only crafts the message.
   *
   * @param bytes - The de-framed payload bytes that failed to decode.
   * @param cause - The underlying decode error, kept on the error chain.
   */
  static forBytes(bytes: Uint8Array, cause?: unknown): CharsetError {
    const bom = CharsetError.#nonUtf8Boms.find(({ mark }) =>
      mark.every((byte, index) => bytes[index] === byte)
    );
    const reason = bom
      ? `The HL7v2 payload begins with a ${bom.encoding} byte-order mark; only UTF-8 is supported.`
      : "The HL7v2 payload is not valid UTF-8; only UTF-8 is supported.";
    return new CharsetError(reason, { cause });
  }
}

import { CharsetError } from "./error";

/**
 * UTF-8 decoder. Fatal: malformed bytes throw rather than silently becoming the
 * U+FFFD replacement character — a silent substitution can change clinical
 * meaning (the failure behind issue #659). It also strips a leading UTF-8 BOM.
 */
const DECODER = new TextDecoder("utf-8", { fatal: true });

/**
 * Decode MLLP-de-framed HL7v2 payload bytes to text as UTF-8 — the decode step
 * the MLLP server and client perform so the rest of the pipeline works in
 * strings.
 *
 * Only UTF-8 is supported for now (it is the HL7 2.x baseline and a strict
 * superset of 7-bit ASCII). Decoding is fatal, so a non-UTF-8 feed fails loudly
 * with a {@link CharsetError} instead of being silently corrupted. Honouring the
 * charset a message declares in MSH-18 (and other encodings) is tracked in
 * issue #662.
 *
 * @param bytes - The de-framed payload bytes.
 * @returns The decoded HL7v2 text.
 * @throws {CharsetError} When the bytes carry a non-UTF-8 BOM or are otherwise
 *   not valid UTF-8.
 */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return DECODER.decode(bytes);
  } catch (error) {
    throw CharsetError.forBytes(bytes, error);
  }
}

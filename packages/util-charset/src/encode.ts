/** UTF-8 encoder (the only encoding the Web platform's `TextEncoder` emits). */
const ENCODER = new TextEncoder();

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

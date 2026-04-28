import { MLLP_END_BYTE_1, MLLP_END_BYTE_2, MLLP_START_BYTE } from "./constants";
import type { EncoderInput, EncoderOptions } from "./types";

/** Module-level singleton — avoids allocation per encode() call. */
const textEncoder = new TextEncoder();

/**
 * Encode a single HL7v2 message into an MLLP frame.
 *
 * Wraps the message with MLLP framing:
 * - Start byte: 0x0B (VT)
 * - End sequence: 0x1C 0x0D (FS + CR)
 */
export function encode(
  message: EncoderInput,
  _options?: EncoderOptions
): Uint8Array {
  const messageBytes =
    typeof message === "string" ? textEncoder.encode(message) : message;

  // Direct allocation: header (1) + message + trailer (2)
  const frame = new Uint8Array(messageBytes.length + 3);
  frame[0] = MLLP_START_BYTE;
  frame.set(messageBytes, 1);
  frame[frame.length - 2] = MLLP_END_BYTE_1;
  frame[frame.length - 1] = MLLP_END_BYTE_2;
  return frame;
}

/**
 * Encode multiple HL7v2 messages into concatenated MLLP frames.
 */
export function encodeMultiple(
  messages: EncoderInput[],
  options?: EncoderOptions
): Uint8Array {
  const frames = messages.map((msg) => encode(msg, options));
  let totalLength = 0;
  for (const frame of frames) {
    totalLength += frame.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    result.set(frame, offset);
    offset += frame.length;
  }
  return result;
}

import { MLLP_END_BYTE_1, MLLP_END_BYTE_2, MLLP_START_BYTE } from "./constants";
import { TransportError } from "./errors";
import type { DecodedMessage, DecoderOptions } from "./types";
import { TransportErrorCode } from "./types";

/**
 * Decode a single MLLP frame (VT ... FS CR) into a message.
 *
 * Validates framing, strips the envelope, and returns the payload as
 * both raw bytes and decoded text. Throws {@link TransportError} on
 * any structural issue.
 *
 * For streaming / chunked TCP data, use {@link createDecoderStream} instead.
 *
 * @throws TransportError with `INVALID_START_BYTE` if byte 0 is not 0x0B
 * @throws TransportError with `INVALID_END_SEQUENCE` if frame doesn't end with
 *   0x1C 0x0D
 * @throws TransportError with `MESSAGE_TOO_LARGE` if payload exceeds
 *   `maxMessageSize`
 */
export function decode(
  frame: Uint8Array,
  options?: DecoderOptions
): DecodedMessage {
  if (frame.length < 3) {
    throw new TransportError(
      TransportErrorCode.INVALID_END_SEQUENCE,
      "Frame too short to contain valid MLLP structure",
      0
    );
  }

  const startByte = frame[0];
  if (startByte !== MLLP_START_BYTE) {
    throw new TransportError(
      TransportErrorCode.INVALID_START_BYTE,
      `Invalid start byte: expected 0x0B, got 0x${(startByte ?? 0).toString(16).padStart(2, "0")}`,
      0
    );
  }

  const len = frame.length;
  const endByte1 = frame[len - 2];
  const endByte2 = frame[len - 1];
  if (endByte1 !== MLLP_END_BYTE_1 || endByte2 !== MLLP_END_BYTE_2) {
    throw new TransportError(
      TransportErrorCode.INVALID_END_SEQUENCE,
      `Invalid end sequence: expected 0x1C 0x0D, got 0x${(endByte1 ?? 0).toString(16).padStart(2, "0")} 0x${(endByte2 ?? 0).toString(16).padStart(2, "0")}`,
      len - 2
    );
  }

  const messageLength = len - 3;
  if (
    options?.maxMessageSize !== undefined &&
    messageLength > options.maxMessageSize
  ) {
    throw new TransportError(
      TransportErrorCode.MESSAGE_TOO_LARGE,
      `Message size ${messageLength} exceeds maximum ${options.maxMessageSize}`,
      0
    );
  }

  const data = frame.subarray(1, len - 2);
  const text = new TextDecoder(options?.encoding ?? "utf8").decode(data);

  return {
    byteLength: messageLength,
    data,
    text,
  };
}

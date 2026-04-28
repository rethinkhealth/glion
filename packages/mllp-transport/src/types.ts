import type { TransportError } from "./errors";

/**
 * Input types for encoding - supports both string and binary
 */
export type EncoderInput = string | Uint8Array;

/**
 * Decoded message result from MLLP frame
 */
export interface DecodedMessage {
  /** The raw message payload (without MLLP framing) */
  data: Uint8Array;
  /** Message decoded as string (convenience) */
  text: string;
  /** Byte length of the original message */
  byteLength: number;
}

/**
 * Options for the MLLP encoder
 */
export interface EncoderOptions {
  /** Encoding for string input (default: 'utf-8') */
  encoding?: string;
}

/**
 * Options for the MLLP decoder
 */
export interface DecoderOptions {
  /** Maximum message size in bytes (optional, no default limit) */
  maxMessageSize?: number;
  /** Encoding for text conversion (default: 'utf-8') */
  encoding?: string;
  /**
   * Called for each frame-level error (invalid start byte, oversized
   * frame, incomplete frame at stream end). Two modes are supported,
   * selected by what the callback does:
   *
   * - **Lenient (return normally)** — the decoder logs/handles the error and
   *   keeps scanning the buffer for the next valid frame. This is the right
   *   default for receivers that process many frames over a long-lived
   *   connection: a single bad frame should not tear down the stream.
   * - **Fatal (throw)** — throwing from inside the callback propagates out of the
   *   underlying `transform()` and errors the readable side of the
   *   `TransformStream`. Downstream `for await ... of` consumers reject with
   *   the thrown value. This is the right mode for one-shot exchanges (e.g. the
   *   MLLP client) where any frame error invalidates the whole exchange.
   *
   * The default callback (when this option is omitted) logs to
   * `console.warn` and returns — i.e. lenient.
   */
  onError?: (error: TransportError) => void;
}

/**
 * Error codes for MLLP frame-level errors
 */
export const TransportErrorCode = {
  /** Stream ended with incomplete MLLP message */
  INCOMPLETE_MESSAGE: "INCOMPLETE_MESSAGE",
  /** Frame does not end with MLLP end sequence (0x1C 0x0D) */
  INVALID_END_SEQUENCE: "INVALID_END_SEQUENCE",
  /** Frame does not start with MLLP start byte (0x0B) */
  INVALID_START_BYTE: "INVALID_START_BYTE",
  /** Message exceeds configured maximum size */
  MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
} as const;

export type TransportErrorCode =
  (typeof TransportErrorCode)[keyof typeof TransportErrorCode];

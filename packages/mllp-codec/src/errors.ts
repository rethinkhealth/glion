/**
 * The typed protocol failure for `@glion/mllp-codec`. Branch on `code` —
 * each code is mutually exclusive, so a `switch` never needs context to
 * disambiguate.
 *
 * @module
 */

/**
 * Machine-readable codes for MLLP protocol violations, named for what the
 * consumer experiences:
 *
 * - `INCOMPLETE_MESSAGE` — the byte stream ended in the middle of a message.
 * - `MESSAGE_TOO_LARGE` — an inbound message exceeded `maxBufferedBytes`.
 * - `RESERVED_CHARACTER` — VT or FS inside message content, in either direction
 *   (outbound via `frame`, inbound via `unframe`).
 * - `UNEXPECTED_DATA` — bytes arrived outside of any message envelope.
 */
export const MllpCodecErrorCode = {
  INCOMPLETE_MESSAGE: "INCOMPLETE_MESSAGE",
  MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
  RESERVED_CHARACTER: "RESERVED_CHARACTER",
  UNEXPECTED_DATA: "UNEXPECTED_DATA",
} as const;

export type MllpCodecErrorCode =
  (typeof MllpCodecErrorCode)[keyof typeof MllpCodecErrorCode];

export class MllpCodecError extends Error {
  readonly code: MllpCodecErrorCode;

  constructor(code: MllpCodecErrorCode, message: string) {
    super(message);
    this.name = "MllpCodecError";
    this.code = code;
  }
}

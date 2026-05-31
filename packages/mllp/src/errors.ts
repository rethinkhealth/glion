/**
 * Errors raised by the `@glion/mllp` server itself.
 *
 * Per ADR 0018: one base error class discriminated by a stable `code` string.
 * A NAK the server *builds* in response to a message is an `@glion/ack`
 * `AckException` — a different concern from a server-lifecycle/config failure,
 * which is what `MllpServerError` represents.
 *
 * @module
 */

export const MllpServerErrorCode = {
  /**
   * `app.handle()` was called before a parser was registered via
   * `app.parser()`.
   */
  NO_PARSER: "NO_PARSER",
} as const;
export type MllpServerErrorCode =
  (typeof MllpServerErrorCode)[keyof typeof MllpServerErrorCode];

/** The one error class the `@glion/mllp` server raises. Branch on `code`. */
export class MllpServerError extends Error {
  readonly code: MllpServerErrorCode;
  constructor(
    code: MllpServerErrorCode,
    message: string,
    opts?: { cause?: unknown }
  ) {
    super(message, opts);
    this.name = "MllpServerError";
    this.code = code;
  }
}

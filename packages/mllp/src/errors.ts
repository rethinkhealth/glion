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
   * An inbound message could not be decoded as UTF-8 — the only character set
   * supported for now. The underlying `@glion/util-charset` `CharsetError` is
   * kept on `cause`; callers branch on this code without importing that
   * package.
   */
  INCOMPATIBLE_CHARSET: "INCOMPATIBLE_CHARSET",
  /** A middleware called `next()` a second time. */
  NEXT_CALLED_TWICE: "NEXT_CALLED_TWICE",
  /**
   * `app.handle()` was called before a parser was registered via
   * `app.parser()`.
   */
  NO_PARSER: "NO_PARSER",
  /**
   * The MLLP byte stream itself was violated and the connection closed:
   * the remote system sent bytes outside a message, glued or unterminated
   * messages, an over-cap message — or a handler's response contained a
   * reserved VT/FS byte and could not be framed. The underlying
   * `@glion/mllp-codec` `MllpCodecError` is kept on `cause`; branch on this
   * code without importing that package.
   */
  PROTOCOL_VIOLATION: "PROTOCOL_VIOLATION",
} as const;
export type MllpServerErrorCode =
  (typeof MllpServerErrorCode)[keyof typeof MllpServerErrorCode];

/** The message of each {@link MllpServerErrorCode}. */
const messages = {
  INCOMPATIBLE_CHARSET:
    "The inbound message is not valid UTF-8; only UTF-8 is supported.",
  NEXT_CALLED_TWICE:
    "A middleware called `next()` a second time; a middleware calls `next()` at most once.",
  NO_PARSER:
    "No parser is registered; `app.parser()` registers the processor that `handle()` reads each message with.",
  PROTOCOL_VIOLATION:
    "The MLLP byte stream is not framed as MLLP requires, and the connection is closing; the error's cause says how.",
} as const satisfies Record<MllpServerErrorCode, string>;

/** The one error class the `@glion/mllp` server raises. Branch on `code`. */
export class MllpServerError extends Error {
  readonly code: MllpServerErrorCode;
  constructor(code: MllpServerErrorCode, opts?: { cause?: unknown }) {
    super(messages[code], opts);
    this.name = "MllpServerError";
    this.code = code;
  }
}

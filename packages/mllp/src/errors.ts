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
  /** `serve()` was called with an option it cannot use. */
  INVALID_OPTION: "INVALID_OPTION",
  /** A middleware called `next()` a second time. */
  NEXT_CALLED_TWICE: "NEXT_CALLED_TWICE",
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

/** An option `serve()` checks before it listens. */
type CheckedOption = "handle" | "port";

/** The message of each {@link MllpServerErrorCode}. */
const messages = {
  INVALID_OPTION: {
    handle:
      "The `handle` option is not a function; `serve()` replies to each message with the `handle` it is given, as in `serve({ handle: app.handle, port: 2575 })`.",
    port: "The `port` option is not an integer from 0 to 65535; `serve()` listens on the TCP port it is given, as in `serve({ handle: app.handle, port: 2575 })`.",
  },
  NEXT_CALLED_TWICE:
    "A middleware called `next()` a second time; a middleware calls `next()` at most once.",
  PROTOCOL_VIOLATION:
    "The MLLP byte stream is not framed as MLLP requires, and the connection is closing; the error's cause says how.",
} as const satisfies Record<
  Exclude<MllpServerErrorCode, "INVALID_OPTION">,
  string
> & { INVALID_OPTION: Record<CheckedOption, string> };

/** The arguments of `new MllpServerError()`. */
type MllpServerErrorArgs =
  | [
      code: typeof MllpServerErrorCode.INVALID_OPTION,
      opts: { option: CheckedOption },
    ]
  | [
      code: Exclude<MllpServerErrorCode, "INVALID_OPTION">,
      opts?: { cause?: unknown },
    ];

/** The one error class the `@glion/mllp` server raises. Branch on `code`. */
export class MllpServerError extends Error {
  readonly code: MllpServerErrorCode;
  /** The option `serve()` cannot use, when `code` is `INVALID_OPTION`. */
  readonly option: CheckedOption | undefined;
  constructor(...[code, opts]: MllpServerErrorArgs) {
    if (code === MllpServerErrorCode.INVALID_OPTION) {
      super(messages.INVALID_OPTION[opts.option]);
      this.option = opts.option;
    } else {
      super(messages[code], opts);
      this.option = undefined;
    }
    this.name = "MllpServerError";
    this.code = code;
  }
}

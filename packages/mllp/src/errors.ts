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
   * The connection was torn down before the remote system closed it: a reset,
   * a broken pipe, a timeout. A socket's `readable` errors with it, and
   * `handleConnection()` then resolves.
   */
  CONNECTION_LOST: "CONNECTION_LOST",
  /**
   * An inbound message could not be decoded as UTF-8 — the only character set
   * supported for now. The underlying `@glion/util-charset` `CharsetError` is
   * kept on `cause`; callers branch on this code without importing that
   * package.
   */
  INCOMPATIBLE_CHARSET: "INCOMPATIBLE_CHARSET",
  /** `serve()` was called with an option it cannot use. */
  INVALID_OPTION: "INVALID_OPTION",
  /**
   * `app.handle()` was called before a parser was registered via
   * `app.parser()`.
   */
  NO_PARSER: "NO_PARSER",
  /**
   * The MLLP byte stream itself was violated and the connection closed:
   * the remote system sent bytes outside a message, glued or unterminated
   * messages, an over-cap message — or a response given to the connection
   * contained a reserved VT/FS byte and could not be framed. The underlying
   * `@glion/mllp-codec` `MllpCodecError` is kept on `cause`; branch on this
   * code without importing that package.
   */
  PROTOCOL_VIOLATION: "PROTOCOL_VIOLATION",
} as const;
export type MllpServerErrorCode =
  (typeof MllpServerErrorCode)[keyof typeof MllpServerErrorCode];

/** An option `serve()` checks before it listens. */
type CheckedOption = "handle" | "options" | "port";

/** The message of each {@link MllpServerErrorCode}. */
const messages = {
  CONNECTION_LOST:
    "The connection is lost before the remote system closes it; a message still in transit is not handled.",
  INCOMPATIBLE_CHARSET:
    "The inbound message is not valid UTF-8; only UTF-8 is supported.",
  INVALID_OPTION: {
    handle:
      "The `handle` option is not a function; `serve()` replies to each message with the `handle` it is given, as in `serve({ handle: app.handle, port: 2575 })`.",
    options:
      "The options given to `serve()` are an app; `serve()` takes one options object, as in `serve({ handle: app.handle, port: 2575 })`.",
    port: "The `port` option is not an integer from 0 to 65535; `serve()` listens on the TCP port it is given, as in `serve({ handle: app.handle, port: 2575 })`.",
  },
  NO_PARSER:
    "No parser is registered; `app.handle()` reads each message with the processor `app.parser()` is given.",
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

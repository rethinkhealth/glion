import { MllpClientError, MllpErrorCode, reasonOf } from "./base";

/**
 * The message cannot be sent as-is: it has no MSH-10 control ID, or it could
 * not be parsed, serialized, or framed. Nothing was written; the reason is on
 * `cause`. Fix the message and send again.
 */
export class MllpInvalidMessageError extends MllpClientError {
  override readonly name = "MllpInvalidMessageError";
  readonly code = MllpErrorCode.INVALID_MESSAGE;
  readonly delivery = "not-sent";

  constructor(cause: unknown) {
    super(
      `The message could not be prepared for sending; nothing was written: ${reasonOf(cause)}`,
      { cause }
    );
  }
}

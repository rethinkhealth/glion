import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The message cannot be sent as-is: it has no MSH-10 control ID, it could not
 * be serialized, or it contains a byte MLLP reserves. Nothing was written; the
 * reason is on `cause`. Fix the message and send again.
 */
export class MllpInvalidMessageError extends MllpClientError {
  override readonly name = "MllpInvalidMessageError";
  readonly code = MllpErrorCode.INVALID_MESSAGE;
  readonly delivery = "not-sent";

  constructor(cause: unknown) {
    super(
      "The message could not be prepared for sending; nothing was written.",
      { cause }
    );
  }
}

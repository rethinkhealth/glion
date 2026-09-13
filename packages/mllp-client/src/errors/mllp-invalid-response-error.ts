import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The reply was not a usable acknowledgment of the message that was waiting:
 * it could not be decoded, its acknowledgment code was missing or unknown, or
 * it answered a different message. The connection is ended. The reason is on
 * `cause`.
 */
export class MllpInvalidResponseError extends MllpClientError {
  override readonly name = "MllpInvalidResponseError";
  readonly code = MllpErrorCode.INVALID_RESPONSE;
  readonly delivery = "unknown";
  /** MSH-10 of the message that was waiting, when the thrower knew it. */
  readonly controlId?: string;

  constructor(cause: unknown, controlId?: string) {
    super(
      "The reply is not a usable acknowledgment of the message that was waiting — the connection has been closed.",
      { cause }
    );
    this.controlId = controlId;
  }
}

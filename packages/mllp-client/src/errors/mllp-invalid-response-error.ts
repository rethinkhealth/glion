import { MllpClientError, MllpErrorCode, reasonOf } from "./base";

/**
 * The reply was not a usable acknowledgment of the message that was waiting:
 * it could not be decoded, its acknowledgment code was missing or unknown, or
 * it answered a different message. The client closes the connection. The
 * reason is on `cause`.
 */
export class MllpInvalidResponseError extends MllpClientError {
  override readonly name = "MllpInvalidResponseError";
  readonly code = MllpErrorCode.INVALID_RESPONSE;
  readonly delivery = "unknown";
  /** MSH-10 of the message that was waiting, when the thrower knew it. */
  readonly controlId?: string;

  constructor(cause: unknown, controlId?: string) {
    super(invalidResponseMessage(cause, controlId), { cause });
    this.controlId = controlId;
  }
}

function invalidResponseMessage(
  cause: unknown,
  controlId: string | undefined
): string {
  const which =
    controlId === undefined
      ? "The acknowledgment"
      : `The acknowledgment for message ${controlId}`;
  return `${which} cannot be used: ${reasonOf(cause)} The connection has been closed; construct a new MllpClient to send again.`;
}

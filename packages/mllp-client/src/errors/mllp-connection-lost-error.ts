import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The connection was lost during a send: the remote system hung up, or the
 * network broke. The remote system may or may not have received the message.
 * A stream error, when there was one, is on `cause`.
 */
export class MllpConnectionLostError extends MllpClientError {
  override readonly name = "MllpConnectionLostError";
  readonly code = MllpErrorCode.CONNECTION_LOST;
  /** MSH-10 of the message that was being sent. */
  readonly controlId: string;

  constructor(controlId: string, cause?: unknown) {
    super(
      "The connection was lost while a message was waiting for its acknowledgment — the remote system may or may not have received it; resend only if the message is safe to repeat.",
      { cause }
    );
    this.controlId = controlId;
  }
}

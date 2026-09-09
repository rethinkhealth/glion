import { MllpClientError, MllpErrorCode } from "./base";

/**
 * No acknowledgment arrived within the send timeout. The client closes the
 * connection. Whether the remote system received the message is unknown.
 */
export class MllpSendTimeoutError extends MllpClientError {
  override readonly name = "MllpSendTimeoutError";
  readonly code = MllpErrorCode.SEND_TIMEOUT;
  readonly delivery = "unknown";
  /** MSH-10 of the message that was waiting. */
  readonly controlId: string;
  readonly timeoutMs: number;

  constructor(controlId: string, timeoutMs: number) {
    super(
      `Message ${controlId} was not acknowledged within ${timeoutMs}ms — the connection has been closed, because a late acknowledgment could not be matched safely. Construct a new MllpClient to send again.`
    );
    this.controlId = controlId;
    this.timeoutMs = timeoutMs;
  }
}

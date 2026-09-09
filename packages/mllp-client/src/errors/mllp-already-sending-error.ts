import { MllpClientError, MllpErrorCode } from "./base";

/**
 * `send()` was called while another message was still waiting for its
 * acknowledgment. The client sends one message at a time.
 */
export class MllpAlreadySendingError extends MllpClientError {
  override readonly name = "MllpAlreadySendingError";
  readonly code = MllpErrorCode.ALREADY_SENDING;
  /** MSH-10 of the message that is still waiting. */
  readonly controlId: string;

  constructor(controlId: string) {
    super(
      `Cannot send: message ${controlId} is still waiting for its acknowledgment — await the in-flight send() first.`
    );
    this.controlId = controlId;
  }
}

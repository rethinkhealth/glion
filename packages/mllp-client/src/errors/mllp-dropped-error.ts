import { MllpClientError, MllpErrorCode, reasonOf } from "./base";

/**
 * The connection was lost during a send: the remote system hung up, or the
 * network broke. The remote system may or may not have received the message.
 * A stream error, when there was one, is on `cause`.
 */
export class MllpDroppedError extends MllpClientError {
  override readonly name = "MllpDroppedError";
  readonly code = MllpErrorCode.DROPPED;
  /** MSH-10 of the message that was being sent. */
  readonly controlId: string;

  constructor(controlId: string, cause?: unknown) {
    super(droppedMessage(controlId, cause), { cause });
    this.controlId = controlId;
  }
}

function droppedMessage(controlId: string, cause: unknown): string {
  const how =
    cause === undefined
      ? "The remote system closed the connection."
      : `The connection failed: ${reasonOf(cause)}`;
  return `The connection was lost while message ${controlId} was waiting for its acknowledgment — the remote system may or may not have received it; resend only if the message is safe to repeat. ${how}`;
}

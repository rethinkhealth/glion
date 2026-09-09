import { MllpClientError, MllpErrorCode, reasonOf } from "./base";
import type { MllpDelivery } from "./base";

/**
 * The connection was lost during a send: the remote system hung up, or the
 * network broke. `delivery` is `not-sent` when the write itself failed and
 * `unknown` once the message was written. A stream error, when there was
 * one, is on `cause`.
 */
export class MllpDroppedError extends MllpClientError {
  override readonly name = "MllpDroppedError";
  readonly code = MllpErrorCode.DROPPED;
  readonly delivery: MllpDelivery;
  /** MSH-10 of the message that was being sent. */
  readonly controlId: string;

  constructor(controlId: string, delivery: MllpDelivery, cause?: unknown) {
    super(droppedMessage(controlId, delivery, cause), { cause });
    this.controlId = controlId;
    this.delivery = delivery;
  }
}

function droppedMessage(
  controlId: string,
  delivery: MllpDelivery,
  cause: unknown
): string {
  const how =
    cause === undefined
      ? "The remote system closed the connection."
      : `The connection failed: ${reasonOf(cause)}`;
  if (delivery === "not-sent") {
    return `The connection was lost before message ${controlId} could be written; nothing reached the wire. ${how}`;
  }
  return `The connection was lost while message ${controlId} was waiting for its acknowledgment — the remote system may or may not have received it; resend only if the message is safe to repeat. ${how}`;
}

import { MllpClientError, MllpErrorCode } from "./base";
import type { MllpDelivery } from "./base";

/**
 * The client is closed for good, by `close()` or by a failure that ended the
 * connection. A closed client never reconnects; construct a new one. When a
 * failure closed the client, that error is on `cause`. A `close()` that
 * cancelled a connection attempt raises this too: nothing was written, and the
 * client is done either way. When `close()` interrupted a message that had
 * already been written, `delivery` is `unknown`.
 */
export class MllpClientClosedError extends MllpClientError {
  override readonly name = "MllpClientClosedError";
  readonly code = MllpErrorCode.CLOSED;
  readonly delivery: MllpDelivery;

  constructor(cause?: MllpClientError, delivery: MllpDelivery = "not-sent") {
    super(closedMessage(cause, delivery), { cause });
    this.delivery = delivery;
  }
}

function closedMessage(
  cause: MllpClientError | undefined,
  delivery: MllpDelivery
): string {
  if (delivery === "unknown") {
    return "The client was closed while a message was waiting for its acknowledgment — the remote system may or may not have received it; resend on a new MllpClient only if the message is safe to repeat.";
  }
  if (cause) {
    return `The client is closed after an earlier failure (${cause.code}) — construct a new MllpClient to send again.`;
  }
  return "The client has been closed — construct a new MllpClient to send again.";
}

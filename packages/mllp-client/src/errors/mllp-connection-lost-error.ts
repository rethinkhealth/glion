import { MllpErrorCode } from "./base";
import { MllpConnectionError } from "./mllp-connection-error";

/**
 * The connection was lost during a send: the remote system hung up, or the
 * network broke. The remote system may or may not have received the message.
 * A stream error, when there was one, is on `cause`.
 */
export class MllpConnectionLostError extends MllpConnectionError {
  override readonly name = "MllpConnectionLostError";
  readonly code = MllpErrorCode.CONNECTION_LOST;
  readonly delivery = "unknown";

  constructor(cause?: unknown) {
    super(
      "The connection was lost while a message was waiting for its acknowledgment — the remote system may or may not have received it; resend only if the message is safe to repeat.",
      { cause }
    );
  }
}

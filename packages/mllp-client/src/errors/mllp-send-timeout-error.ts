import { MllpErrorCode } from "./base";
import { MllpConnectionError } from "./mllp-connection-error";

/**
 * No acknowledgment arrived within the send timeout. The connection is ended.
 * Whether the remote system received the message is unknown.
 */
export class MllpSendTimeoutError extends MllpConnectionError {
  override readonly name = "MllpSendTimeoutError";
  readonly code = MllpErrorCode.SEND_TIMEOUT;
  readonly delivery = "unknown";
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      "No acknowledgment arrived within the send timeout — the connection has been closed, because a late acknowledgment could not be matched safely."
    );
    this.timeoutMs = timeoutMs;
  }
}

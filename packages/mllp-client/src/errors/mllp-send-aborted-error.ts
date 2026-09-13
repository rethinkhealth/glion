import { MllpClientError, MllpErrorCode } from "./base";

/**
 * `destroy()` cut off the message in flight. The remote system may or may not
 * have received it.
 */
export class MllpSendAbortedError extends MllpClientError {
  override readonly name = "MllpSendAbortedError";
  readonly code = MllpErrorCode.SEND_ABORTED;
  readonly delivery = "unknown";

  constructor() {
    super(
      "The send was cut off by destroy() — the remote system may or may not have received the message; resend only if the message is safe to repeat."
    );
  }
}

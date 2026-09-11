import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The call cannot be served: the client is closed, by `close()`, by
 * `destroy()`, or by a lost connection the reconnect policy did not restore.
 * That last failure is on `cause`.
 */
export class MllpClientClosedError extends MllpClientError {
  override readonly name = "MllpClientClosedError";
  readonly code = MllpErrorCode.CLOSED;
  readonly delivery = "not-sent";

  constructor(cause: MllpClientError | null = null) {
    super(
      cause === null
        ? "The client is closed — construct a new MllpClient to send again."
        : "The client closed after its connection could not be restored — construct a new MllpClient to send again.",
      { cause: cause ?? undefined }
    );
  }
}

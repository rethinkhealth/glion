import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The client is closed, by `close()`, by `destroy()`, or by a failure that
 * ended the connection. A closed client never reconnects; construct a new one.
 *
 * The failure that closed it, if there was one, reached whoever was waiting on
 * the connection and the `disconnect` event. It is not kept here.
 */
export class MllpClientClosedError extends MllpClientError {
  override readonly name = "MllpClientClosedError";
  readonly code = MllpErrorCode.CLOSED;

  constructor() {
    super(
      "The client has been closed — construct a new MllpClient to send again."
    );
  }
}

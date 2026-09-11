import { MllpErrorCode } from "./base";
import { MllpConnectionError } from "./mllp-connection-error";

/**
 * The connection could not be opened: the host was unreachable, refused the
 * connection, or failed DNS or TLS. The socket's error is on `cause`.
 */
export class MllpConnectionFailedError extends MllpConnectionError {
  override readonly name = "MllpConnectionFailedError";
  readonly code = MllpErrorCode.CONNECTION_FAILED;
  readonly delivery = "not-sent";

  constructor(cause: unknown) {
    super(
      "Connecting failed — check that the host is reachable and the port is listening.",
      { cause }
    );
  }
}

import { MllpClientError, MllpErrorCode, reasonOf } from "./base";

/**
 * The connection could not be opened: the host was unreachable, refused the
 * connection, or failed DNS or TLS. The connector's error is on `cause`.
 */
export class MllpConnectFailedError extends MllpClientError {
  override readonly name = "MllpConnectFailedError";
  readonly code = MllpErrorCode.CONNECT_FAILED;

  constructor(cause: unknown) {
    super(
      `Connecting failed: ${reasonOf(cause)} — check that the host is reachable and the port is listening.`,
      { cause }
    );
  }
}

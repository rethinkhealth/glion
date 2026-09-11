import { MllpClientError, MllpErrorCode } from "./base";

/**
 * The remote system did not accept the connection within `connectTimeoutMs`.
 * The host may be down, overloaded, or silently dropping packets.
 */
export class MllpConnectTimeoutError extends MllpClientError {
  override readonly name = "MllpConnectTimeoutError";
  readonly code = MllpErrorCode.CONNECT_TIMEOUT;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      "Connecting timed out — check that the host is reachable and the port is listening."
    );
    this.timeoutMs = timeoutMs;
  }
}

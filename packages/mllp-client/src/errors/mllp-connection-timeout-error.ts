import { MllpErrorCode } from "./base";
import { MllpConnectionError } from "./mllp-connection-error";

/**
 * The remote system did not accept the connection within `connectTimeoutMs`.
 * The host may be down, overloaded, or silently dropping packets.
 */
export class MllpConnectionTimeoutError extends MllpConnectionError {
  override readonly name = "MllpConnectionTimeoutError";
  readonly code = MllpErrorCode.CONNECTION_TIMEOUT;
  readonly delivery = "not-sent";
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      "Connecting timed out — check that the host is reachable and the port is listening."
    );
    this.timeoutMs = timeoutMs;
  }
}

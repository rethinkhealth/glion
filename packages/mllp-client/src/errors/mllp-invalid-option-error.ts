import { MllpClientError, MllpErrorCode } from "./base";

/** An option is out of range. Raised before anything happens. */
export class MllpInvalidOptionError extends MllpClientError {
  override readonly name = "MllpInvalidOptionError";
  readonly code = MllpErrorCode.INVALID_OPTION;
  readonly delivery = "not-sent";
}

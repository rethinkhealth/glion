import { Hl7ErrorCode, Severity } from "../constants";
import { AckApplicationError } from "../exception";

/**
 * Application internal error (MSA-1 = `AE`, ERR-3 = `207`, ERR-4 = `E`).
 *
 * Used to wrap unexpected/unknown errors that don't map to a specific
 * HL7v2 error condition. This is the default error produced by
 * `ackMiddleware` when a handler throws an unrecognized exception.
 */
export class ApplicationInternalError extends AckApplicationError {
  constructor(message: string, cause?: Error) {
    super(message, {
      cause,
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
    });
    this.name = "ApplicationInternalError";
  }
}

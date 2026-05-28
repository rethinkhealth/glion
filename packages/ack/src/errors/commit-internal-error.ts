import { Hl7ErrorCode, Severity } from "../constants";
import { AckCommitError } from "../exception";

/**
 * Commit-level internal error (MSA-1 = `CE`, ERR-3 = `207`, ERR-4 = `E`).
 *
 * Used when the message could not be persisted due to an internal
 * infrastructure failure (e.g. database unavailable).
 */
export class CommitInternalError extends AckCommitError {
  constructor(message: string, cause?: Error) {
    super(message, {
      cause,
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
    });
    this.name = "CommitInternalError";
  }
}

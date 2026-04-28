import type { Segment } from "@glion/ast";
import { f, s } from "@glion/builder";

import { AckCode, Severity } from "./constants";
import type {
  AckCodeValue,
  Hl7ErrorCodeValue,
  SeverityValue,
} from "./constants";

export interface AckExceptionOptions extends ErrorOptions {
  errorCode: Hl7ErrorCodeValue;
  severity?: SeverityValue;
  /**
   * The raw HL7v2 ACK message associated with this exception, when one
   * exists. Set when the exception is derived from an existing ACK;
   * left undefined when no ACK has been produced yet.
   */
  raw?: string;
}

/**
 * Abstract base class for all HL7v2 acknowledgment exceptions.
 *
 * Subclasses map to specific MSA-1 acknowledgment codes (Table 0008).
 * Each exception carries an error code (Table 0357), optional severity
 * (Table 0516), and can build its own ERR segment AST via {@link toErrSegment}.
 *
 * Use `instanceof AckException` to detect any ACK-level error in middleware.
 */
export abstract class AckException extends Error {
  abstract readonly code: AckCodeValue;
  readonly errorCode: Hl7ErrorCodeValue;
  readonly severity: SeverityValue | undefined;
  /**
   * The raw HL7v2 ACK message associated with this exception, when one
   * exists. Set when the exception is derived from an existing ACK;
   * left undefined when no ACK has been produced yet.
   */
  readonly raw: string | undefined;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, { cause: options.cause });
    this.errorCode = options.errorCode;
    this.severity = options.severity;
    this.raw = options.raw;
  }

  /**
   * Build an ERR segment AST node from this exception's error code and
   * severity.
   */
  toErrSegment(): Segment {
    return s(
      "ERR",
      f(""),
      f(""),
      f(this.errorCode),
      f(this.severity ?? Severity.Error)
    );
  }
}

/**
 * Application-level error (MSA-1 = `AE`).
 *
 * Throw when the message was understood but could not be processed
 * due to an application-level problem (e.g. validation failure, unknown key).
 */
export class AckApplicationError extends AckException {
  readonly code = AckCode.ApplicationError;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, options);
    this.name = "AckApplicationError";
  }
}

/**
 * Application-level reject (MSA-1 = `AR`).
 *
 * Throw when the message is rejected outright at the application level
 * (e.g. unsupported message type, unsupported version).
 */
export class AckApplicationReject extends AckException {
  readonly code = AckCode.ApplicationReject;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, options);
    this.name = "AckApplicationReject";
  }
}

/**
 * Commit-level error (MSA-1 = `CE`).
 *
 * Throw when the message could not be safely persisted/committed
 * (e.g. storage failure). Used in enhanced acknowledgment mode.
 */
export class AckCommitError extends AckException {
  readonly code = AckCode.CommitError;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, options);
    this.name = "AckCommitError";
  }
}

/**
 * Commit-level reject (MSA-1 = `CR`).
 *
 * Throw when the message is rejected at the commit level
 * (e.g. message cannot be stored). Used in enhanced acknowledgment mode.
 */
export class AckCommitReject extends AckException {
  readonly code = AckCode.CommitReject;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, options);
    this.name = "AckCommitReject";
  }
}

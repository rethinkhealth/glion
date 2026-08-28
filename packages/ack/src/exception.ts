import { AckCode } from "./constants";
import type { AckNakCode } from "./constants";

export interface AckExceptionOptions extends ErrorOptions {
  /**
   * ERR-3 condition code (Table 0357 — see {@link Hl7ErrorCode}). A known
   * code when building an outbound rejection; an arbitrary peer-supplied
   * string — or absent — when derived from an inbound ACK that may carry a
   * non-standard code or no ERR segment at all.
   */
  errorCode?: string;
  /**
   * ERR-4 severity (Table 0516 — see `Severity`); optional for inbound
   * ACKs.
   */
  severity?: string;
  /**
   * MSA-3 text message — the remote system's own diagnostic sentence, when
   * the NAK carried one. Exceptions deliberately do not carry the full ACK
   * payload (raw text or AST): message content on an exception ends up in
   * logs and error trackers, and full HL7v2 payloads carry PHI.
   */
  text?: string;
  /**
   * MSA-2 message control ID echoed from the original MSH-10 of the
   * message the receiver is rejecting. Present when the exception is
   * derived from an inbound ACK; absent when synthesised before any
   * acknowledgment exists.
   */
  controlId?: string;
}

/**
 * Abstract base class for all HL7v2 acknowledgment exceptions.
 *
 * Subclasses map to specific MSA-1 acknowledgment codes (Table 0008).
 * Each exception carries an error code (Table 0357), optional severity
 * (Table 0516). Building an ERR segment is deliberately left to the
 * implementation: its layout changed across HL7v2 versions (ELD in ERR-1
 * before v2.5, ERR-3/ERR-4 after), so a version-agnostic package carries
 * the data instead of rendering the segment.
 *
 * Use `instanceof AckException` to detect any ACK-level error in middleware.
 */
export abstract class AckException extends Error {
  abstract readonly code: AckNakCode;
  readonly errorCode: string | undefined;
  readonly severity: string | undefined;
  /** MSA-3 text message from the remote NAK, when present. */
  readonly text: string | undefined;
  /**
   * MSA-2 control ID echoed from the original MSH-10. Present when the
   * exception is derived from an inbound ACK; absent otherwise.
   */
  readonly controlId: string | undefined;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, { cause: options.cause });
    this.errorCode = options.errorCode;
    this.severity = options.severity;
    this.text = options.text;
    this.controlId = options.controlId;
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

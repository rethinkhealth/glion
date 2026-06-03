import type { Field, Root, Segment } from "@glion/ast";
import { c, f, s } from "@glion/builder";

import { AckCode, Severity } from "./constants";
import type { AckCodeValue } from "./constants";

/**
 * ERR-2 error location (HL7v2 `ERL` data type) — points a receiver at the exact
 * field that triggered the error, e.g. `{ segmentId: "MSH", segmentSequence: 1,
 * fieldPosition: 18 }` serializes to `MSH^1^18`. Only `segmentId` is required;
 * trailing components are omitted when absent.
 */
export interface ErrorLocation {
  /** ERR-2.1 — segment ID (e.g. `"MSH"`). */
  segmentId: string;
  /** ERR-2.2 — 1-based occurrence of the segment within the message. */
  segmentSequence?: number;
  /** ERR-2.3 — 1-based field position within the segment. */
  fieldPosition?: number;
  /** ERR-2.4 — 1-based field repetition. */
  fieldRepetition?: number;
  /** ERR-2.5 — 1-based component number. */
  componentNumber?: number;
  /** ERR-2.6 — 1-based subcomponent number. */
  subcomponentNumber?: number;
}

export interface AckExceptionOptions extends ErrorOptions {
  /**
   * ERR-3 condition code (Table 0357 — see {@link Hl7ErrorCode}). A known
   * code when building an outbound rejection; an arbitrary peer-supplied
   * string — or absent — when derived from an inbound ACK that may carry a
   * non-standard code or no ERR segment at all.
   */
  errorCode?: string;
  /**
   * ERR-4 severity (Table 0516 — see {@link Severity}); optional for inbound
   * ACKs.
   */
  severity?: string;
  /**
   * The raw HL7v2 ACK message associated with this exception, when one
   * exists. Set when the exception is derived from an existing ACK;
   * left undefined when no ACK has been produced yet.
   */
  raw?: string;
  /**
   * MSA-2 message control ID echoed from the original MSH-10 of the
   * message the receiver is rejecting. Present when the exception is
   * derived from an inbound ACK; absent when synthesised before any
   * acknowledgment exists.
   */
  controlId?: string;
  /**
   * Parsed AST of the ACK this exception was derived from, when one exists.
   * Lets a consumer walk ERR repetitions or other segments without
   * re-parsing `raw`. Absent when the exception is synthesised before any
   * acknowledgment.
   */
  tree?: Root;
  /**
   * ERR-2 error location — points the receiver at the offending field. Omitted
   * from the ERR segment when absent.
   */
  errorLocation?: ErrorLocation;
  /**
   * ERR-7 diagnostic information — a detailed, machine-oriented description of
   * the problem. Omitted from the ERR segment when absent.
   */
  diagnosticInformation?: string;
  /**
   * ERR-8 user message — a human-readable message suitable for display.
   * Omitted from the ERR segment when absent.
   */
  userMessage?: string;
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
  readonly errorCode: string | undefined;
  readonly severity: string | undefined;
  /**
   * The raw HL7v2 ACK message associated with this exception, when one
   * exists. Set when the exception is derived from an existing ACK;
   * left undefined when no ACK has been produced yet.
   */
  readonly raw: string | undefined;
  /**
   * MSA-2 control ID echoed from the original MSH-10. Present when the
   * exception is derived from an inbound ACK; absent otherwise.
   */
  readonly controlId: string | undefined;
  /**
   * Parsed AST of the ACK this exception was derived from. Present when
   * derived from an inbound ACK; absent when synthesised. Lets a consumer
   * walk ERR repetitions or other segments without re-parsing `raw`.
   */
  readonly tree: Root | undefined;
  /** ERR-2 error location pointing at the offending field, when known. */
  readonly errorLocation: ErrorLocation | undefined;
  /** ERR-7 diagnostic information, when provided. */
  readonly diagnosticInformation: string | undefined;
  /** ERR-8 user message, when provided. */
  readonly userMessage: string | undefined;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, { cause: options.cause });
    this.errorCode = options.errorCode;
    this.severity = options.severity;
    this.raw = options.raw;
    this.controlId = options.controlId;
    this.tree = options.tree;
    this.errorLocation = options.errorLocation;
    this.diagnosticInformation = options.diagnosticInformation;
    this.userMessage = options.userMessage;
  }

  /**
   * Build an ERR segment AST node from this exception. ERR-1 (deprecated),
   * ERR-3 (code) and ERR-4 (severity) are always present; ERR-2 (location),
   * ERR-7 (diagnostic) and ERR-8 (user message) are populated only when the
   * corresponding option was supplied, so the segment stays minimal by default.
   */
  toErrSegment(): Segment {
    const fields: Field[] = [
      f(""), // ERR-1 (deprecated)
      this.errorLocation ? errorLocationField(this.errorLocation) : f(""), // ERR-2
      f(this.errorCode ?? ""), // ERR-3
      f(this.severity ?? Severity.Error), // ERR-4
    ];

    // ERR-5/ERR-6 are left empty; only emit them when a later field is set.
    if (
      this.diagnosticInformation !== undefined ||
      this.userMessage !== undefined
    ) {
      fields.push(
        f(""), // ERR-5
        f(""), // ERR-6
        f(this.diagnosticInformation ?? ""), // ERR-7
        f(this.userMessage ?? "") // ERR-8
      );
    }

    return s("ERR", ...fields);
  }
}

/**
 * Build the ERR-2 `ERL` field from an {@link ErrorLocation}, dropping trailing
 * absent components so `{ segmentId: "MSH" }` is just `MSH`, not `MSH^^^^^`.
 */
function errorLocationField(location: ErrorLocation): Field {
  const components: Array<string | number | undefined> = [
    location.segmentId,
    location.segmentSequence,
    location.fieldPosition,
    location.fieldRepetition,
    location.componentNumber,
    location.subcomponentNumber,
  ];

  let lastIndex = components.length - 1;
  while (lastIndex >= 0 && components[lastIndex] === undefined) {
    lastIndex -= 1;
  }

  return f(
    ...components
      .slice(0, lastIndex + 1)
      .map((part) => c(part === undefined ? "" : String(part)))
  );
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

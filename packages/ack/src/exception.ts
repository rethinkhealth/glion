import type { Field, Nodes, Root, Segment } from "@glion/ast";
import { f, s } from "@glion/builder";
import { format } from "@glion/util-query";

import { AckCode, Severity } from "./constants";
import type { AckCodeValue, AckNakCode } from "./constants";

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
   * AST node responsible for the error. When set (with
   * {@link AckExceptionOptions.ancestors}), ERR-2 is derived from the node's
   * position in the message via `@glion/util-query`'s `format` — e.g. an MSH-18
   * repetition serializes to `MSH-18[1]`.
   */
  node?: Nodes;
  /**
   * Ancestor chain of {@link AckExceptionOptions.node} (root → parent), as
   * returned by `select`/`value`/`visit`. Used to derive ERR-2.
   */
  ancestors?: Nodes[];
  /**
   * ERR-7 diagnostic information — a detailed description of the problem.
   * Omitted from the ERR segment when absent.
   */
  diagnosticInformation?: string;
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
  /** AST node responsible for the error, used to derive ERR-2. */
  readonly node: Nodes | undefined;
  /** Ancestor chain of {@link AckException.node}, used to derive ERR-2. */
  readonly ancestors: Nodes[] | undefined;
  /** ERR-7 diagnostic information, when provided. */
  readonly diagnosticInformation: string | undefined;

  constructor(message: string, options: AckExceptionOptions) {
    super(message, { cause: options.cause });
    this.errorCode = options.errorCode;
    this.severity = options.severity;
    this.raw = options.raw;
    this.controlId = options.controlId;
    this.tree = options.tree;
    this.node = options.node;
    this.ancestors = options.ancestors;
    this.diagnosticInformation = options.diagnosticInformation;
  }

  /**
   * Build an ERR segment AST node from this exception. ERR-1 (deprecated),
   * ERR-3 (code) and ERR-4 (severity) are always present; ERR-2 (location,
   * derived from {@link AckException.node}) and ERR-7 (diagnostic) are populated
   * only when supplied, so the segment stays minimal by default.
   */
  toErrSegment(): Segment {
    const location = this.node ? format(this.node, this.ancestors ?? []) : null;
    const fields: Field[] = [
      f(""), // ERR-1 (deprecated)
      f(location ?? ""), // ERR-2 error location
      f(this.errorCode ?? ""), // ERR-3
      f(this.severity ?? Severity.Error), // ERR-4
    ];

    // ERR-5/ERR-6 are left empty; only emit them when ERR-7 is set.
    if (this.diagnosticInformation !== undefined) {
      fields.push(
        f(""), // ERR-5
        f(""), // ERR-6
        f(this.diagnosticInformation) // ERR-7
      );
    }

    return s("ERR", ...fields);
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

/** Maps each Table 0008 reject code to its exception class. */
const NAK_EXCEPTIONS: Record<
  AckNakCode,
  new (message: string, options: AckExceptionOptions) => AckException
> = {
  [AckCode.ApplicationError]: AckApplicationError,
  [AckCode.ApplicationReject]: AckApplicationReject,
  [AckCode.CommitError]: AckCommitError,
  [AckCode.CommitReject]: AckCommitReject,
};

/**
 * Build the {@link AckException} for a NAK code (`AE`/`AR`/`CE`/`CR`) — the
 * single place that maps a Table 0008 reject code to its exception class, so a
 * consumer parsing an inbound ACK doesn't re-implement the switch. Pass the
 * `errorCode` (ERR-3), `severity` (ERR-4), `controlId` (MSA-2), `raw`, and
 * `tree` read off the ACK via {@link AckExceptionOptions}.
 */
export function ackExceptionFor(
  code: AckNakCode,
  options: AckExceptionOptions
): AckException {
  const Exception = NAK_EXCEPTIONS[code];
  return new Exception(
    `The message was rejected with acknowledgment code ${code}.`,
    options
  );
}

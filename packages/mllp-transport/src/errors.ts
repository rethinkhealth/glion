import type { TransportErrorCode } from "./types";

/**
 * Options for constructing an MllpError.
 */
export interface MllpErrorOptions extends ErrorOptions {
  /** Error condition string (e.g., for ERR segment in ACK) */
  errorCondition?: string;
}

/**
 * Base error class for all MLLP errors.
 *
 * Provides a common `code` field so that any MLLP error can be
 * programmatically identified and translated (e.g., into ACK/NAK responses).
 * Extended by transport-, server-, and client-side packages.
 */
export class MllpError extends Error {
  /** Machine-readable error code identifying the error type */
  readonly code: string;
  /** Error condition string (e.g., for ERR segment in ACK) */
  readonly errorCondition?: string;

  constructor(code: string, message: string, options?: MllpErrorOptions) {
    super(message, options);
    this.name = "MllpError";
    this.code = code;
    this.errorCondition = options?.errorCondition;
  }
}

/**
 * Transport-level error for MLLP framing issues (invalid framing, incomplete
 * messages, etc.)
 */
export class TransportError extends MllpError {
  declare readonly code: TransportErrorCode;
  /** Position in the data where the error occurred (if applicable) */
  readonly position?: number;

  constructor(code: TransportErrorCode, message: string, position?: number) {
    super(code, message);
    this.name = "TransportError";
    this.position = position;
  }
}

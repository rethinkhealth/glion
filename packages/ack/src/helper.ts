/**
 * Type guards over the HL7v2 Table 0008 acknowledgment codes — the runtime
 * half of `./constants`.
 *
 * @module
 */

import { AckCode } from "./constants";
import type { AckNakCode } from "./constants";

// Derived from AckCode, so the guard can never drift from the table.
const ACK_CODES: ReadonlySet<string> = new Set(Object.values(AckCode));

/** Narrow an arbitrary string to a Table 0008 acknowledgment code. */
export function isAckCode(value: string): value is AckCode {
  return ACK_CODES.has(value);
}

/**
 * Narrow an arbitrary string to a NAK code — the reject half of Table 0008,
 * defined the way the spec defines it: any acknowledgment code that is not
 * an accept.
 */
export function isAckNakCode(value: string): value is AckNakCode {
  return (
    isAckCode(value) &&
    value !== AckCode.ApplicationAccept &&
    value !== AckCode.CommitAccept
  );
}

/**
 * Option validation. Each `assert*` throws {@link MllpInvalidOptionError} for
 * an option a caller passed out of range, before anything happens.
 *
 * @module
 */

import { MAX_TIMEOUT_MS } from "./constants";
import { MllpInvalidOptionError } from "./errors";

export function assertTimeoutMs(option: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new MllpInvalidOptionError(
      `${option} must be a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}.`
    );
  }
}

export function assertByteCap(bytes: number): void {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new MllpInvalidOptionError(
      "maxBufferedBytes must be a positive integer."
    );
  }
}

export function assertReconnectAttempts(attempts: number): void {
  const unbounded = attempts === Number.POSITIVE_INFINITY;
  if (!unbounded && (!Number.isInteger(attempts) || attempts < 0)) {
    throw new MllpInvalidOptionError(
      "reconnect.attempts must be a non-negative integer, or Infinity."
    );
  }
}

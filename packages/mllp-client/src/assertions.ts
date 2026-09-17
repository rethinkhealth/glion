/**
 * Option validation, and the client's invariants. Each option `assert*`
 * throws {@link MllpInvalidOptionError} for an option a caller passed out of
 * range, before anything happens. {@link assertPhase} throws for a phase the
 * client cannot be in where it is asserted: a bug.
 *
 * @module
 */

import { MAX_TIMEOUT_MS } from "./constants";
import { MllpInvalidOptionError } from "./errors";
import type { State } from "./state";

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

/** `state` is in `phase`; `where` names the site for the report. */
export function assertPhase<P extends State["phase"]>(
  state: State,
  phase: P,
  where: string
): asserts state is Extract<State, { phase: P }> {
  if (state.phase !== phase) {
    throw new Error(
      `${where} found the client ${state.phase}. This is a bug in @glion/mllp-client; please report it.`
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

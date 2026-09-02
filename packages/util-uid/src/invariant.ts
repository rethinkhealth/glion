/**
 * Assertion primitives for this package's own internal invariants — bugs in
 * OUR arithmetic, never domain outcomes (a NAK is an `AckException`; an
 * invariant failure must never masquerade as one).
 */

/** Thrown when an internal invariant is violated — always a bug; report it. */
export class InvariantError extends Error {
  constructor(message: string) {
    super(
      `@glion/util-uid internal invariant violated: ${message} — this is a bug, please report it`
    );
    this.name = "InvariantError";
  }
}

/** Assert `condition`; the `asserts` signature also narrows types for tsc. */
export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

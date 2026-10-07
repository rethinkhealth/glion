/**
 * Asserts `condition`, an internal invariant of this package, and narrows its
 * type.
 *
 * @throws {Error} When `condition` is falsy. The message names the package and
 *   says it is a bug.
 */
export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(
      `@glion/profiles internal invariant violated: ${message} — this is a bug, please report it`
    );
  }
}

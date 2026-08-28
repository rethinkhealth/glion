/**
 * Time-ordered unique IDs for MSH-10 control IDs — the ULID idea resized to
 * HL7v2's 20-character ST limit (a standard 26-character ULID cannot fit).
 * Stateless: fresh randomness every call, the same semantics as the ULID
 * reference implementation's default `ulid()`.
 *
 * @module
 */

import { invariant } from "./invariant";

// MSH-10 is ST(20) — the whole ID budget.
const MAX_LENGTH = 20;

// Characters the millisecond timestamp occupies. One base32 character is
// 5 bits, so 10 characters hold 50 — every timestamp until the year 10889,
// the same horizon as a standard ULID.
const TIME_LENGTH = 10;

// Crockford base32 (https://www.crockford.com/base32.html): 0-9 plus the
// uppercase alphabet minus I, L, O (read back as 1 and 0 by humans) and U
// (accidental profanity). Index N encodes value N, so equal-length encodings
// sort lexicographically in numeric order — what makes the IDs time-sortable
// as plain strings. No HL7 delimiters, nothing legacy engines trip over.
// Exported for its tests, not part of the package surface.
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Encode `value` as exactly `length` Crockford base32 characters,
 * zero-padded. Throws when `value` is not a non-negative integer below
 * `32 ** length` — exported for its tests, not part of the package surface.
 */
export function encodeCrockford(value: number, length: number): string {
  // A value that does not fit would be truncated into a valid-LOOKING ID
  // that silently stops sorting (and can collide). Loud beats silent for
  // our own arithmetic — same rationale as unframe's assertInvariant.
  invariant(
    Number.isInteger(value) && value >= 0,
    `${value} is not encodable — the encoder takes non-negative integers`
  );
  invariant(
    value < 32 ** length,
    `${value} does not fit ${length} base32 characters`
  );
  let out = "";
  let rest = value;
  for (let i = 0; i < length; i++) {
    // Plain base conversion, like toString(16) with a custom alphabet:
    // `rest % 32` is the lowest base32 digit, prepending puts high digits
    // first — so larger values sort later as strings.
    out = ALPHABET[rest % 32] + out;
    rest = Math.floor(rest / 32);
  }
  // The loop always runs `length` times; once `rest` hits 0 it emits "0"s.
  // That left-padding is load-bearing: "2" < "10" numerically but not
  // lexicographically — constant width keeps string order = numeric order.
  return out;
}

/**
 * `length` Crockford characters of fresh randomness — exported for its
 * tests, not part of the package surface.
 */
export function randomChars(length: number): string {
  // One random byte per character. A byte spans 256 values and 256 is a
  // whole multiple of 32, so `byte % 32` is exactly uniform over the
  // alphabet — 5 bits of randomness per character, no bias, and no bit
  // arithmetic to combine draws.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % 32];
  }
  return out;
}

export interface UidOptions {
  size?: number;
}

/**
 * Generate an MSH-10-safe control ID: timestamp + randomness, `size`
 * characters total (default 20 — MSH-10's ST limit). IDs sort
 * lexicographically by millisecond; same-millisecond IDs are unique but
 * unordered. Keep `size >= 11`: the timestamp needs 10 characters, and
 * per-millisecond uniqueness rests on what remains. Need a branded ID?
 * Compose it: `"MKE" + uid({ size: 17 })`.
 */
export function uid(options: UidOptions = {}): string {
  const { size = MAX_LENGTH } = options;
  // Boundary validation, not an internal invariant: a bad `size` is the
  // caller's bug, so it gets a native RangeError, never InvariantError.
  // Unchecked, NaN would silently emit a bare timestamp with ZERO
  // randomness (Uint8Array(NaN) has length 0) — colliding IDs that look
  // perfectly valid.
  if (!(Number.isInteger(size) && size > 0)) {
    throw new RangeError(`uid size must be a positive integer, got ${size}`);
  }
  if (size <= TIME_LENGTH) {
    // Too narrow for a timestamp: unique, but not time-sortable.
    return randomChars(size);
  }

  const timestamp = encodeCrockford(Date.now(), TIME_LENGTH);
  const random = randomChars(size - TIME_LENGTH);
  return timestamp + random;
}

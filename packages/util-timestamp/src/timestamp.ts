import type { Precision } from "./precision";

/**
 * Options for creating a Timestamp from a Date.
 */
export interface TimestampOptions {
  /**
   * Precision level for formatting.
   *
   * @default "second"
   */
  precision?: Precision;

  /**
   * Whether to include the local timezone offset in the output.
   * Only applies when precision is `"hour"` or finer.
   * Uses `Date.getTimezoneOffset()` to auto-detect the offset.
   *
   * @default false
   */
  timezone?: boolean;
}

// ---------------------------------------------------------------------------
// Performance: Pre-computed lookup table for 0-99 → zero-padded strings.
// Avoids String(n).padStart(2, "0") which allocates a new string + calls
// padStart on every invocation. In a streaming processor handling 100K+ msg/s,
// this eliminates ~6 padStart calls per toString() invocation.
// ---------------------------------------------------------------------------
const PAD2_TABLE: string[] = Array.from({ length: 100 }, (_, i) =>
  i < 10 ? `0${i}` : `${i}`
);

function pad2(n: number): string {
  return PAD2_TABLE[n] ?? String(n);
}

// ---------------------------------------------------------------------------
// Performance: O(1) precision index lookup via Map instead of Array.indexOf().
// Array.indexOf() does a linear scan on every call. With 7 elements the scan
// is short, but this is called in both from() and toString() — two linear
// scans per message. A Map lookup is constant-time.
// ---------------------------------------------------------------------------
const PRECISION_INDEX = new Map<Precision, number>([
  ["year", 0],
  ["month", 1],
  ["day", 2],
  ["hour", 3],
  ["minute", 4],
  ["second", 5],
  ["millisecond", 6],
]);

/** Minimum precision index that supports a timezone offset (hour = 3). */
const MIN_TIMEZONE_PRECISION = 3;

// ---------------------------------------------------------------------------
// Performance: Precision detection from string length instead of regex.
// HL7v2 timestamps have a fixed structure where length directly maps to
// precision. This avoids regex compilation, match array allocation, and
// group iteration — replacing it with a single Map lookup.
// ---------------------------------------------------------------------------
const PRECISION_BY_LENGTH = new Map<number, Precision>([
  [4, "year"],
  [6, "month"],
  [8, "day"],
  [10, "hour"],
  [12, "minute"],
  [14, "second"],
]);

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${pad2(hours)}${pad2(minutes)}`;
}

// ---------------------------------------------------------------------------
// Performance: Manual character-based digit extraction instead of regex.
// charCodeAt(i) - 48 converts ASCII '0'-'9' to 0-9 without allocating
// substrings or calling Number(). This avoids the regex match array
// (9 capture groups) and 6 Number() conversions per parse() call.
// ---------------------------------------------------------------------------

/** Get the code point at offset, returning 0 for out-of-bounds. */
function code(s: string, offset: number): number {
  return s.codePointAt(offset) ?? 0;
}

/** Extract a 2-digit number from a string at the given offset. */
function digits2(s: string, offset: number): number {
  return (code(s, offset) - 48) * 10 + (code(s, offset + 1) - 48);
}

/** Extract a 4-digit number from a string at the given offset. */
function digits4(s: string, offset: number): number {
  return (
    (code(s, offset) - 48) * 1000 +
    (code(s, offset + 1) - 48) * 100 +
    (code(s, offset + 2) - 48) * 10 +
    (code(s, offset + 3) - 48)
  );
}

/** Check if a character at the given offset is an ASCII digit. */
function isDigit(s: string, offset: number): boolean {
  const cp = code(s, offset);
  return cp >= 48 && cp <= 57;
}

// ---------------------------------------------------------------------------
// Performance: Validate the core numeric portion without regex.
// Only checks that all characters up to the fractional/timezone boundary
// are ASCII digits and that the total length is a valid even number.
// This replaces the HL7V2_TS_PATTERN regex which allocated a match array
// with 8 capture groups on every call.
// ---------------------------------------------------------------------------

function validateDigits(value: string, end: number): boolean {
  for (let i = 0; i < end; i += 1) {
    if (!isDigit(value, i)) {
      return false;
    }
  }
  return true;
}

/**
 * An immutable HL7v2 timestamp value with precision tracking.
 *
 * Represents the HL7v2 TS (Time Stamp) data type:
 * `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`
 *
 * Tracks precision so that round-tripping is lossless:
 * `Timestamp.parse("20260307").toString()` returns `"20260307"`, not
 * `"20260307000000"`.
 *
 * Performance characteristics (optimized for high-throughput streaming):
 * - `toString()`: Direct string concatenation, no intermediate arrays
 * - `parse()`: Manual character extraction, no regex or match arrays
 * - Constant-time precision lookups via Map
 * - Pre-computed pad table eliminates padStart overhead
 *
 * @example
 *   ```typescript
 *   // From a Date
 *   Timestamp.from(new Date(), { precision: "day" }).toString(); // "20260307"
 *
 *   // Parse an HL7v2 string (timezone is applied to the Date)
 *   const ts = Timestamp.parse("20260307143000-0500");
 *   ts.precision; // "second"
 *   ts.toDate(); // Date representing 2026-03-07T19:30:00Z
 *
 *   // Current time
 *   Timestamp.now().toString(); // "20260307143045"
 *   ```;
 */
export class Timestamp {
  readonly #date: Date;
  readonly precision: Precision;

  /**
   * Timezone offset in minutes (getTimezoneOffset convention).
   * Set when the timestamp carries timezone information — either from parsing
   * a string with a +/-ZZZZ suffix, or from creating via from()/now() with
   * timezone: true.
   *
   * When set, toString() uses UTC getters + this offset to derive the local
   * time components, ensuring correct formatting regardless of server timezone.
   * When undefined, toString() uses local getters (no timezone suffix).
   */
  readonly #offset?: number;

  /** Raw fractional seconds string from parsing, for lossless round-trip. */
  readonly #fractionalRaw?: string;

  private constructor(
    date: Date,
    precision: Precision,
    offset?: number,
    fractionalRaw?: string
  ) {
    this.#date = date;
    this.precision = precision;
    this.#offset = offset;
    this.#fractionalRaw = fractionalRaw;
  }

  /**
   * Create a Timestamp from a JavaScript Date.
   *
   * @param date - A valid Date object
   * @param options - Precision and timezone options
   * @throws {TypeError} If the Date is invalid
   */
  static from(date: Date, options?: TimestampOptions): Timestamp {
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Invalid Date provided to Timestamp.from");
    }
    const precision = options?.precision ?? "second";
    // Performance: O(1) Map lookup instead of Array.indexOf()
    const precisionIndex = PRECISION_INDEX.get(precision) ?? 5;
    const includeTimezone =
      (options?.timezone ?? false) && precisionIndex >= MIN_TIMEZONE_PRECISION;

    // Defensive copy — caller may mutate the original Date
    const copy = new Date(date);
    return new Timestamp(
      copy,
      precision,
      includeTimezone ? copy.getTimezoneOffset() : undefined
    );
  }

  /**
   * Parse an HL7v2 timestamp string into a Timestamp.
   *
   * Uses manual character-based extraction instead of regex to avoid
   * match array allocation and Number() conversions. In benchmarks this
   * is ~2-3x faster than regex-based parsing for the common case.
   *
   * @param value - An HL7v2 TS-formatted string
   * @throws {TypeError} If the string is not a valid HL7v2 timestamp
   */
  // oxlint-disable-next-line complexity/complexity -- hand-rolled DTM scanner: one branch per precision component and offset form, kept regex-free for speed
  static parse(value: string): Timestamp {
    const len = value.length;
    if (len < 4) {
      throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
    }

    // -----------------------------------------------------------------------
    // Find where the core digit portion ends. It can be followed by:
    //   - '.' for fractional seconds
    //   - '+' or '-' for timezone offset
    //   - end of string
    // -----------------------------------------------------------------------
    let coreEnd = len;
    let dotPos = -1;
    let tzPos = -1;

    for (let i = 0; i < len; i += 1) {
      const ch = value.codePointAt(i);
      if (ch === 46) {
        // '.'
        dotPos = i;
        coreEnd = i;
        break;
      }
      if ((ch === 43 || ch === 45) && i >= 4) {
        // '+' or '-', but not at start
        tzPos = i;
        coreEnd = i;
        break;
      }
    }

    // If we found a dot, look for timezone after it
    if (dotPos >= 0) {
      for (let i = dotPos + 1; i < len; i += 1) {
        const ch = value.codePointAt(i);
        if (ch === 43 || ch === 45) {
          // '+' or '-'
          tzPos = i;
          break;
        }
      }
    }

    // Validate: core digits must be even-length (pairs: YYYY MM DD HH mm ss)
    // and between 4 and 14 characters
    if (coreEnd < 4 || coreEnd > 14 || coreEnd % 2 !== 0) {
      throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
    }

    // Validate all core characters are digits
    if (!validateDigits(value, coreEnd)) {
      throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
    }

    // -----------------------------------------------------------------------
    // Extract date/time components via direct charCodeAt arithmetic.
    // digits4/digits2 convert ASCII chars to numbers without substring
    // allocation or Number() parsing.
    // -----------------------------------------------------------------------
    const year = digits4(value, 0);
    const month = coreEnd >= 6 ? digits2(value, 4) - 1 : 0;
    const day = coreEnd >= 8 ? digits2(value, 6) : 1;
    const hour = coreEnd >= 10 ? digits2(value, 8) : 0;
    const minute = coreEnd >= 12 ? digits2(value, 10) : 0;
    const second = coreEnd >= 14 ? digits2(value, 12) : 0;

    // -----------------------------------------------------------------------
    // Fractional seconds: preserve the raw string (e.g., ".1234") for
    // lossless round-trip. JS Date only holds 3 digits of ms precision,
    // but HL7v2 allows 4 — storing the raw string lets toString() reproduce
    // the original exactly.
    // -----------------------------------------------------------------------
    let ms = 0;
    let fractionalRaw: string | undefined;
    if (dotPos >= 0) {
      const fracEnd = tzPos >= 0 ? tzPos : len;
      fractionalRaw = value.slice(dotPos, fracEnd);
      const fracDigits = fracEnd - dotPos - 1;

      // Validate fractional digits: 1-4 digits after the dot
      if (fracDigits < 1 || fracDigits > 4) {
        throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
      }
      // Validate fractional portion (digits after the dot)
      for (let i = dotPos + 1; i < fracEnd; i += 1) {
        if (!isDigit(value, i)) {
          throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
        }
      }

      // Convert fractional digits to ms (pad or truncate to 3 digits)
      const d0 = fracDigits >= 1 ? code(value, dotPos + 1) - 48 : 0;
      const d1 = fracDigits >= 2 ? code(value, dotPos + 2) - 48 : 0;
      const d2 = fracDigits >= 3 ? code(value, dotPos + 3) - 48 : 0;
      ms = d0 * 100 + d1 * 10 + d2;
    }

    // -----------------------------------------------------------------------
    // Timezone offset: parse the +/-HHMM suffix.
    // Convention follows Date.getTimezoneOffset(): +0530 → -330 minutes.
    // When present, we construct the Date using UTC so it represents the
    // correct absolute moment in time.
    // -----------------------------------------------------------------------
    let parsedOffset = 0;
    const hasTimezone = tzPos >= 0;
    if (hasTimezone) {
      const remaining = len - tzPos;
      if (remaining !== 5) {
        throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
      }
      // Validate the 4 timezone digits after the sign
      for (let i = tzPos + 1; i < len; i += 1) {
        if (!isDigit(value, i)) {
          throw new TypeError(`Invalid HL7v2 timestamp: "${value}"`);
        }
      }
      const tzSign = value.codePointAt(tzPos) === 43 ? -1 : 1; // '+' → -1
      const tzHours = digits2(value, tzPos + 1);
      const tzMinutes = digits2(value, tzPos + 3);
      // `|| 0` normalises -0 to 0 (e.g. "+0000" → sign=-1, total=0 → -0)
      parsedOffset = tzSign * (tzHours * 60 + tzMinutes) || 0;
    }

    // -----------------------------------------------------------------------
    // Precision detection: O(1) Map lookup based on core digit length.
    // No regex group counting needed.
    // -----------------------------------------------------------------------
    const precision: Precision = fractionalRaw
      ? "millisecond"
      : (PRECISION_BY_LENGTH.get(coreEnd) ?? "year");

    let date: Date;
    if (hasTimezone) {
      // Construct from UTC: the parsed components represent local time at the
      // given offset. Convert to UTC so the Date carries the correct instant.
      // UTC = localTime + offset (getTimezoneOffset convention)
      const utcMs =
        Date.UTC(year, month, day, hour, minute, second, ms) +
        parsedOffset * 60_000;
      date = new Date(utcMs);
      // Fix: Date.UTC treats years 0-99 as 1900-1999
      if (year < 100) {
        date.setUTCFullYear(year);
      }
    } else {
      // No timezone: treat components as local time
      date = new Date(year, month, day, hour, minute, second, ms);
      // Fix: JS Date treats years 0-99 as 1900-1999
      date.setFullYear(year);
    }

    return new Timestamp(
      date,
      precision,
      hasTimezone ? parsedOffset : undefined,
      fractionalRaw
    );
  }

  /**
   * Create a Timestamp for the current time.
   *
   * Performance: Skips the defensive Date copy in from() since we own the
   * Date object — it was just created and no external reference exists.
   *
   * @param options - Precision and timezone options
   */
  static now(options?: TimestampOptions): Timestamp {
    const date = new Date();
    const precision = options?.precision ?? "second";
    const precisionIndex = PRECISION_INDEX.get(precision) ?? 5;
    const includeTimezone =
      (options?.timezone ?? false) && precisionIndex >= MIN_TIMEZONE_PRECISION;

    // No defensive copy needed — we just created this Date, no one else holds a reference
    return new Timestamp(
      date,
      precision,
      includeTimezone ? date.getTimezoneOffset() : undefined
    );
  }

  /**
   * Return a copy of the underlying Date object.
   */
  toDate(): Date {
    return new Date(this.#date);
  }

  /**
   * Format as an HL7v2 timestamp string, respecting the precision level.
   *
   * Performance: Uses direct string concatenation instead of array.join().
   * V8 optimizes template literal concatenation into a single allocation,
   * while the array approach required: 1 array + 6 strings + slice + join
   * = ~9 allocations per call. This approach: 1 string concatenation.
   */
  toString(): string {
    const d = this.#date;
    // When the Date was constructed from UTC (via parse() with timezone),
    // use UTC getters + the stored offset to reconstruct the sender's local
    // time components. This enables lossless round-trip regardless of server TZ.
    // When the Date was constructed locally (from/now), local getters are correct.
    let yyyy: string;
    let mm: string;
    let dd: string;
    let hh: string;
    let min: string;
    let ss: string;
    if (this.#offset === undefined) {
      // No timezone: use local getters directly
      const y = d.getFullYear();
      yyyy = y >= 1000 ? String(y) : String(y).padStart(4, "0");
      mm = pad2(d.getMonth() + 1);
      dd = pad2(d.getDate());
      hh = pad2(d.getHours());
      min = pad2(d.getMinutes());
      ss = pad2(d.getSeconds());
    } else {
      // Reconstruct the local time at the stored offset from UTC
      const local = new Date(d.getTime() - this.#offset * 60_000);
      const y = local.getUTCFullYear();
      yyyy = y >= 1000 ? String(y) : String(y).padStart(4, "0");
      mm = pad2(local.getUTCMonth() + 1);
      dd = pad2(local.getUTCDate());
      hh = pad2(local.getUTCHours());
      min = pad2(local.getUTCMinutes());
      ss = pad2(local.getUTCSeconds());
    }

    let result: string;

    switch (this.precision) {
      case "year": {
        result = yyyy;
        break;
      }
      case "month": {
        result = `${yyyy}${mm}`;
        break;
      }
      case "day": {
        result = `${yyyy}${mm}${dd}`;
        break;
      }
      case "hour": {
        result = `${yyyy}${mm}${dd}${hh}`;
        break;
      }
      case "minute": {
        result = `${yyyy}${mm}${dd}${hh}${min}`;
        break;
      }
      case "second": {
        result = `${yyyy}${mm}${dd}${hh}${min}${ss}`;
        break;
      }
      case "millisecond": {
        const base = `${yyyy}${mm}${dd}${hh}${min}${ss}`;
        if (this.#fractionalRaw) {
          // Parsed timestamps: use the raw string for lossless round-trip
          result = `${base}${this.#fractionalRaw}`;
        } else {
          // Created from Date: derive fractional from Date.getMilliseconds().
          // Manual trailing-zero trim instead of regex replace(/0+$/, "").
          const msVal = d.getMilliseconds();
          if (msVal === 0) {
            result = `${base}.0`;
          } else if (msVal % 100 === 0) {
            result = `${base}.${msVal / 100}`;
          } else if (msVal % 10 === 0) {
            result = `${base}.${pad2(msVal / 10)}`;
          } else {
            result = `${base}.${String(msVal).padStart(3, "0")}`;
          }
        }
        break;
      }
      default: {
        // Exhaustive check: if a new precision is added, this will surface
        // a TypeScript error ("Type 'x' is not assignable to type 'never'").
        const _exhaustive: never = this.precision;
        throw new TypeError(`Unknown precision: ${_exhaustive}`);
      }
    }

    if (this.#offset !== undefined) {
      result += formatOffset(this.#offset);
    }

    return result;
  }
}

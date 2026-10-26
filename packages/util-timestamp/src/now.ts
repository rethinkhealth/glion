import { Precision } from "./precision";
import type { DTM } from "./types";

// `nowDTM` reads the clock in three steps, shown at 2024-01-15T07:30:00.123Z
// in America/New_York:
//
// 1. `offsetAt` gives the zone's offset from UTC at that moment: `-300`.
// 2. The moment moved by the offset and read in UTC is the zone's wall clock:
//    2024-01-15 02:30:00.123.
// 3. `fieldsOf` keeps the wall clock's fields down to `precision`, and
//    `nowDTM` adds `fraction` and `offset`: `20240115023000.123-0500`. A
//    year, month, or day is a date and has no offset by default: `20240115`.

const MILLISECONDS_PER_MINUTE = 60_000;
const FRACTION_DIGITS = 3;

const PRECISIONS = Object.values(Precision);

const DATE_PRECISIONS: ReadonlySet<Precision> = new Set([
  Precision.Year,
  Precision.Month,
  Precision.Day,
]);

/** Options for {@link nowDTM}. */
export interface NowDTMOptions {
  /**
   * The last field the value gives, without `fraction`. Defaults to every
   * field down to the second, with the milliseconds in `fraction`.
   *
   * In a TS, HL7v2 v2.1 accepts only the minute or the second, with no
   * `fraction`; v2.2 adds the day and `fraction`; v2.3 and later accept every
   * precision.
   */
  precision?: Precision;
  /**
   * The IANA time zone the fields are read in, such as `America/New_York` or
   * `UTC`. Defaults to the host's time zone. The fields are the date and time
   * in that zone: a value for a facility in another zone needs that zone.
   */
  timeZone?: string;
  /**
   * Whether the value gives its offset from UTC. Defaults to `true` when the
   * value goes to the hour or further, and to `false` when it stops at the
   * year, month, or day.
   */
  offset?: boolean;
}

// Formatters cost about 25 µs to build and 2 µs to use, so each `timeZone`
// string gets one, built on first use.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const formatter =
    formatters.get(timeZone) ??
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      second: "numeric",
      timeZone,
      year: "numeric",
    });
  // Stryker disable next-line CallExpression: the cache saves time only; a formatter built on every call reads the same fields.
  formatters.set(timeZone, formatter);
  return formatter;
}

function numberOf(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  // Stryker disable next-line OptionalChaining: the formatter gives a part for every field its options name.
  return Number(parts.find((part) => part.type === type)?.value);
}

/**
 * The offset from UTC in minutes, positive east of UTC, of `timeZone` at
 * `date`, or of the host's time zone when `timeZone` is `undefined`.
 */
function offsetAt(date: Date, timeZone: string | undefined): number {
  // Stryker disable next-line ConditionalExpression,BlockStatement: with `TZ` fixed for the process, Intl with no `timeZone` reads the same zone as `Date`, so `if (false)` and the empty block give the same offset; `if (true)` is killed by the named-zone tests.
  if (timeZone === undefined) {
    // The host's zone: `Date` already knows its offset.
    // `getTimezoneOffset()` is positive west of UTC; `0 -` keeps UTC at `+0`.
    return 0 - date.getTimezoneOffset();
  }
  // A named zone: Intl reads the wall clock there (02:30:00 in New York), and
  // that time, read as if it were UTC, minus the real moment (07:30:00 UTC) is
  // the offset: -5 h, so -300. The milliseconds are copied over unchanged, as
  // every zone's offset is a whole number of minutes.
  const parts = formatterFor(timeZone).formatToParts(date);
  const wallClock = Date.UTC(
    numberOf(parts, "year"),
    numberOf(parts, "month") - 1,
    numberOf(parts, "day"),
    numberOf(parts, "hour"),
    numberOf(parts, "minute"),
    numberOf(parts, "second"),
    date.getUTCMilliseconds()
  );
  return (wallClock - date.getTime()) / MILLISECONDS_PER_MINUTE;
}

/** The fields of `wallClock`, read in UTC, from the year down to `precision`. */
function fieldsOf(wallClock: Date, precision: Precision): DTM {
  // How many fields after the year to keep: `year` is 0, `month` 1, ...
  // `second` 5.
  const depth = PRECISIONS.indexOf(precision);
  const value: DTM = { precision, year: wallClock.getUTCFullYear() };
  if (depth >= 1) {
    value.month = wallClock.getUTCMonth() + 1;
  }
  if (depth >= 2) {
    value.day = wallClock.getUTCDate();
  }
  if (depth >= 3) {
    value.hour = wallClock.getUTCHours();
  }
  if (depth >= 4) {
    value.minute = wallClock.getUTCMinutes();
  }
  if (depth >= 5) {
    value.second = wallClock.getUTCSeconds();
  }
  return value;
}

/**
 * The current time as a DTM, read in the host's time zone or in
 * `options.timeZone`.
 *
 * Reads the clock once. The offset is the zone's at that moment, so it follows
 * daylight saving time. Without `options.precision`, the value gives every
 * field down to the second, and the milliseconds as a 3-digit `fraction`; with
 * it, the value stops at that field and has no `fraction`. A value that stops
 * at the year, month, or day has no offset unless `options.offset` is `true`.
 *
 * @example
 *   ```ts
 *   formatDTM(nowDTM()); // "20240115023000.123-0500"
 *   formatDTM(nowDTM({ precision: Precision.Second, timeZone: "UTC" })); // "20240115073000+0000"
 *   formatDTM(nowDTM({ offset: false, precision: Precision.Minute })); // "202401150230"
 *   formatDTM(nowDTM({ precision: Precision.Day })); // "20240115"
 *   ```;
 *
 * @throws {RangeError} When `options.timeZone` is not a time zone Intl knows.
 */
export function nowDTM(options: NowDTMOptions = {}): DTM {
  const { precision, timeZone } = options;
  const cut = precision ?? Precision.Second;
  // A date, like `20240115`, is a calendar day, not a moment: by default it
  // has no offset, as HL7v2 writes a DT or a date of birth.
  const withOffset = options.offset ?? !DATE_PRECISIONS.has(cut);
  // Read the clock once; every field below comes from this one moment.
  const now = new Date();

  // Step 1: -300 in New York in January, -240 in July.
  const offset = offsetAt(now, timeZone);

  // Step 2: 07:30:00.123 UTC moved by -300 min reads 02:30:00.123 in UTC.
  const wallClock = new Date(now.getTime() + offset * MILLISECONDS_PER_MINUTE);

  // Step 3: `20240115023000.123-0500`.
  const value = fieldsOf(wallClock, cut);
  if (precision === undefined) {
    value.fraction = String(wallClock.getUTCMilliseconds()).padStart(
      FRACTION_DIGITS,
      "0"
    );
  }
  if (withOffset) {
    value.offset = offset;
  }
  return value;
}

import { pad } from "./format";
import { Precision } from "./precision";
import type { DTM } from "./types";

// `nowDTM` reads the clock once, shown at 2024-01-15T07:30:00.123Z in
// America/New_York:
//
// 1. `offsetAt` gives the zone's offset from UTC at that moment: `-300`.
// 2. The moment moved by the offset and read in UTC is the zone's wall clock:
//    2024-01-15 02:30:00.123.
// 3. `fieldsOf` keeps the wall clock's fields down to `precision`, and
//    `nowDTM` adds `fraction` and, to a value with an hour, `offsetText`'s
//    `-0500`: `20240115023000.123-0500`. With `timeZone: "UTC"`, the offset
//    is `-0000`.

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const FRACTION_DIGITS = 3;

const PRECISIONS = Object.values(Precision);

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
   *
   * `UTC` gives the offset `-0000`. Every other zone gives the offset it
   * measures, `+0000` at offset zero, including `Etc/UTC` and a host whose
   * time zone is UTC.
   */
  timeZone?: string;
  /**
   * Whether the value gives its offset from UTC. Defaults to `true` when the
   * value goes to the hour or further, and to `false` when it stops at the
   * year, month, or day.
   */
  offset?: boolean;
}

// A formatter costs about 25 µs to build and 2 µs to read, so each `timeZone`
// gets one on first use.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOf(timeZone: string): Intl.DateTimeFormat {
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
 * The offset from UTC in whole minutes, positive east of UTC, of `timeZone` at
 * `date`, or of the host's time zone when `timeZone` is `undefined`.
 */
function offsetAt(date: Date, timeZone: string | undefined): number {
  if (timeZone === undefined) {
    // `getTimezoneOffset()` is positive west of UTC.
    return -date.getTimezoneOffset();
  }
  // Intl reads the wall clock in the zone (02:30:00 in New York), and that
  // time, read as if it were UTC, minus the real moment (07:30:00.123 UTC) is
  // the offset: -5 h less 123 ms, rounded to -300.
  const parts = formatterOf(timeZone).formatToParts(date);
  const wallClock = Date.UTC(
    numberOf(parts, "year"),
    numberOf(parts, "month") - 1,
    numberOf(parts, "day"),
    numberOf(parts, "hour"),
    numberOf(parts, "minute"),
    numberOf(parts, "second")
  );
  return Math.round((wallClock - date.getTime()) / MILLISECONDS_PER_MINUTE);
}

/** `minutes` as `+/-HHMM`, such as `-300` as `"-0500"`. */
function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const magnitude = Math.abs(minutes);
  return `${sign}${pad(Math.floor(magnitude / MINUTES_PER_HOUR), 2)}${pad(magnitude % MINUTES_PER_HOUR, 2)}`;
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
 * With `timeZone: "UTC"`, the offset is `-0000`; every other zone at offset
 * zero, such as `Europe/London` in winter, gives `+0000`.
 *
 * @example
 *   ```ts
 *   formatDTM(nowDTM()); // "20240115023000.123-0500"
 *   formatDTM(nowDTM({ precision: Precision.Second, timeZone: "UTC" })); // "20240115073000-0000"
 *   formatDTM(nowDTM({ offset: false, precision: Precision.Minute })); // "202401150230"
 *   formatDTM(nowDTM({ precision: Precision.Day })); // "20240115"
 *   ```;
 *
 * @throws {RangeError} When `options.timeZone` is not a time zone Intl knows.
 */
export function nowDTM(options: NowDTMOptions = {}): DTM {
  const { precision, timeZone } = options;
  const now = new Date();
  const minutes = offsetAt(now, timeZone);
  const wallClock = new Date(now.getTime() + minutes * MILLISECONDS_PER_MINUTE);
  const value = fieldsOf(wallClock, precision ?? Precision.Second);
  if (precision === undefined) {
    value.fraction = pad(wallClock.getUTCMilliseconds(), FRACTION_DIGITS);
  }
  // A date, like `20240115`, is a calendar day, not a moment: by default it
  // has no offset, as HL7v2 writes a DT or a date of birth.
  if (options.offset ?? value.hour !== undefined) {
    // HL7v2 v2.9: `-0000` is UTC with no local time zone.
    value.offset = timeZone === "UTC" ? "-0000" : offsetText(minutes);
  }
  return value;
}

import { Precision } from "./precision";
import type { DTM, Offset } from "./types";

// The whole fields of a DTM, in order. Each is named as a precision and as an
// Intl part.
const FIELDS = ["year", "month", "day", "hour", "minute", "second"] as const;

// The last formatter built, kept for the next call with the same `timeZone`:
// building one takes about 20 µs, and reading the time with it about 3 µs. A
// formatter for the host's zone keeps the zone the host had when it was built.
let last: { formatter: Intl.DateTimeFormat; timeZone?: string } | undefined;

/** Options for {@link nowDTM}. */
export interface NowDTMOptions {
  /**
   * The last field the value gives. Defaults to `fraction`: every field, and
   * the milliseconds as 3 digits.
   *
   * In a TS, HL7v2 v2.1 accepts only `minute` or `second`. v2.2 adds `day`,
   * and a fraction of exactly 4 digits, which `nowDTM` does not write (#1130).
   * v2.3 and later accept every precision, and a fraction of 1 to 4 digits.
   */
  precision?: Precision;
  /**
   * The time zone the fields are read in: an IANA time zone name, such as
   * `America/New_York` or `UTC`, or an offset from UTC, such as `-05:00`.
   * Defaults to the host's time zone. The fields are the date and time in
   * that zone: a value for a facility in another zone needs that zone.
   *
   * `UTC`, in any case, gives the offset `-0000`, UTC with no local time zone
   * (HL7v2 v2.9). Any other zone at offset zero gives `+0000`, including
   * `Etc/UTC` and a host whose time zone is UTC.
   */
  timeZone?: string;
  /**
   * Whether the value gives its offset from UTC. Defaults to `true` when the
   * value goes to the hour or further, and to `false` when it stops at the
   * year, month, or day.
   */
  offset?: boolean;
}

/**
 * The current time as a DTM, in the host's time zone or in `options.timeZone`,
 * with that zone's offset from UTC at this moment.
 *
 * @example
 *   ```ts
 *   formatDTM(nowDTM()); // "20240115023000.123-0500"
 *   formatDTM(nowDTM({ precision: Precision.Second, timeZone: "UTC" })); // "20240115073000-0000"
 *   formatDTM(nowDTM({ offset: false, precision: Precision.Minute })); // "202401150230"
 *   formatDTM(nowDTM({ precision: Precision.Day })); // "20240115"
 *   ```;
 *
 * @throws {RangeError} When `options.timeZone` is neither an IANA time zone
 *   name nor an offset from UTC.
 */
export function nowDTM(options: NowDTMOptions = {}): DTM {
  const { precision = Precision.Fraction, timeZone } = options;

  // Stryker disable next-line ConditionalExpression: equivalent; a formatter built on every call gives the same value, only slower
  if (last === undefined || last.timeZone !== timeZone) {
    // The locale is fixed, so every host writes the parts the same way:
    // `en-US` writes ASCII digits, the Gregorian calendar, and an ASCII minus.
    last = {
      formatter: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        // The milliseconds, as 3 digits: 5 ms is `005`.
        fractionalSecondDigits: 3,
        hour: "numeric",
        // A 24-hour clock: `en-US` alone writes 14:00 as `2`.
        hourCycle: "h23",
        minute: "numeric",
        month: "numeric",
        second: "numeric",
        timeZone,
        // The offset as `GMT-05:00`, rather than a name such as `EST`.
        timeZoneName: "longOffset",
        year: "numeric",
      }),
      timeZone,
    };
  }

  // At 2024-01-15T07:30:00.123Z in New York, `fields` is { year: "2024",
  // month: "1", day: "15", hour: "02", minute: "30", second: "00",
  // fractionalSecond: "123", timeZoneName: "GMT-05:00", literal: … }.
  const fields = Object.fromEntries(
    last.formatter
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  // The fields from the year down to the precision: `day` keeps 2024, 1, 15.
  const value: DTM = { precision, year: Number(fields.year) };
  for (const field of FIELDS) {
    value[field] = Number(fields[field]);
    if (field === precision) {
      break;
    }
  }
  if (precision === Precision.Fraction) {
    value.fraction = fields.fractionalSecond;
  }

  // A date names a calendar day, not a moment, so by default it has no offset.
  const withOffset = options.offset ?? value.hour !== undefined;
  if (withOffset) {
    // `GMT-05:00` is written `-0500`, and `GMT` alone `+0000`.
    const offset = String(fields.timeZoneName)
      .replace("GMT", "")
      .replace(":", "");
    value.offset =
      timeZone?.toUpperCase() === "UTC"
        ? "-0000"
        : ((offset || "+0000") as Offset);
  }
  return value;
}

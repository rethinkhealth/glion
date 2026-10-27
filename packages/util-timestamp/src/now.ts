import { Precision } from "./precision";
import type { DTM } from "./types";

// The whole fields of a DTM, in order. Each is also the name of a precision
// and of an Intl part.
const FIELDS = ["year", "month", "day", "hour", "minute", "second"] as const;

/** Options for {@link nowDTM}. */
export interface NowDTMOptions {
  /**
   * The last field the value gives. Defaults to `fraction`: every field, and
   * the milliseconds as 3 digits.
   *
   * In a TS, HL7v2 v2.1 accepts only `minute` or `second`; v2.2 adds `day`
   * and `fraction`; v2.3 and later accept every precision.
   */
  precision?: Precision;
  /**
   * The IANA time zone the fields are read in, such as `America/New_York` or
   * `UTC`. Defaults to the host's time zone. The fields are the date and time
   * in that zone: a value for a facility in another zone needs that zone.
   *
   * `UTC` gives the offset `-0000`, UTC with no local time zone (HL7v2 v2.9).
   * Any other zone at offset zero gives `+0000`, including `Etc/UTC` and a
   * host whose time zone is UTC.
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
 * @throws {RangeError} When `options.timeZone` is not an IANA time zone name.
 */
export function nowDTM(options: NowDTMOptions = {}): DTM {
  const { precision = Precision.Fraction, timeZone } = options;

  // Intl reads the date, the time, and the offset in the zone at one moment.
  // At 2024-01-15T07:30:00.123Z in New York, the fields are year `2024`,
  // month `1`, day `15`, hour `02`, minute `30`, second `00`,
  // fractionalSecond `123`, and timeZoneName `GMT-05:00`.
  //
  // The locale sets how each part is written, so it is fixed: `en-US` writes
  // ASCII digits, the Gregorian calendar, and `GMT-05:00` with an ASCII minus,
  // whatever the host's locale. `ar-EG` would write the year `٢٠٢٤`, and
  // `fr-FR` the offset `UTC−05:00`.
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    // The milliseconds, as 3 digits: 5 ms is `005`.
    fractionalSecondDigits: 3,
    hour: "numeric",
    // A 24-hour clock: `en-US` alone writes 14:00 as `2` and midnight as `12`.
    hourCycle: "h23",
    minute: "numeric",
    month: "numeric",
    second: "numeric",
    timeZone,
    // The offset as hours and minutes, `GMT-05:00` or `GMT+05:45`, rather
    // than a name such as `EST`.
    timeZoneName: "longOffset",
    year: "numeric",
  }).formatToParts(new Date());
  // `formatToParts` gives a list, in the locale's order and with the
  // separators: `[{ type: "month", value: "1" }, { type: "literal", value:
  // "/" }, …]`. As an object, each part is read by its type: `fields.month`
  // is `"1"`.
  const fields = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  // Each precision is named after the last field it keeps, and those names
  // are Intl's part types too. So the value takes the fields from the year
  // on and stops at the precision: `day` keeps 2024, 1, 15. A DTM always has
  // a year, so it starts with one. `fraction` stops at none of them, and
  // adds the milliseconds: `123`.
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
  // A date, like `20240115`, is a calendar day, not a moment: by default it
  // has no offset, as HL7v2 writes a DT or a date of birth.
  if (options.offset ?? value.hour !== undefined) {
    // `GMT-05:00` is written `-0500`, and `GMT`, offset zero, `+0000`. In
    // `UTC`, the offset is `-0000`: HL7v2 v2.9's UTC with no local time zone.
    const offset = String(fields.timeZoneName).slice(3).replace(":", "");
    value.offset = timeZone === "UTC" ? "-0000" : offset || "+0000";
  }
  return value;
}

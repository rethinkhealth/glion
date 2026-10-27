import { checkDate, checkOffset, checkTime } from "./check";
import type { DT, DTM, Offset, ParseResult, TM } from "./types";

const INVALID_FORMAT = {
  issue: { code: "invalid-format" },
  success: false,
} as const satisfies ParseResult<never>;

// The HL7v2 formats. Each bracket of the format is an optional group, and
// each field is one capture, in the order the format writes them.

// DT: YYYY[MM[DD]]
const DT_FORMAT = /^(\d{4})(?:(\d{2})(\d{2})?)?$/;

// TM: HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]
const TM_FORMAT =
  /^(\d{2})(?:(\d{2})(?:(\d{2})(?:\.(\d{1,4}))?)?)?([+-]\d{4})?$/;

// DTM: YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
const DTM_FORMAT =
  /^(\d{4})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:\.(\d{1,4}))?)?)?)?)?)?([+-]\d{4})?$/;

/** The date the captured fields give. Each field makes it more precise. */
function readDate(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined
): DT {
  const date: DT = { precision: "year", year: Number(year) };
  if (month !== undefined) {
    date.month = Number(month);
    date.precision = "month";
  }
  if (day !== undefined) {
    date.day = Number(day);
    date.precision = "day";
  }
  return date;
}

/** The time the captured fields give. Each field makes it more precise. */
function readTime(
  hour: string | undefined,
  minute: string | undefined,
  second: string | undefined,
  fraction: string | undefined
): TM {
  const time: TM = { hour: Number(hour), precision: "hour" };
  if (minute !== undefined) {
    time.minute = Number(minute);
    time.precision = "minute";
  }
  if (second !== undefined) {
    time.second = Number(second);
    time.precision = "second";
  }
  if (fraction !== undefined) {
    time.fraction = fraction;
    time.precision = "fraction";
  }
  return time;
}

/**
 * Parses an HL7v2 DT (Date) value, `YYYY[MM[DD]]`.
 *
 * Fails with `invalid-format` when the value does not follow the format, and
 * with `month-out-of-range` or `day-out-of-range` when it is not a calendar
 * date, such as `20250229`. Never throws.
 *
 * @example
 *   ```ts
 *   parseDT("202603");
 *   // { success: true, data: { year: 2026, month: 3, precision: "month" } }
 *   ```;
 */
export function parseDT(value: string): ParseResult<DT> {
  const match = DT_FORMAT.exec(value);
  if (match === null) {
    return INVALID_FORMAT;
  }

  const [, year, month, day] = match;
  const data = readDate(year, month, day);
  const issue = checkDate(data.year, data.month, data.day);
  return issue ? { issue, success: false } : { data, success: true };
}

/**
 * Parses an HL7v2 TM (Time) value, `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`.
 *
 * Fails with `invalid-format` when the value does not follow the format, and
 * with `hour-out-of-range`, `minute-out-of-range`, `second-out-of-range`, or
 * `offset-out-of-range` when a field is out of range. Never throws.
 *
 * @example
 *   ```ts
 *   parseTM("1430-0500");
 *   // { success: true, data: { hour: 14, minute: 30, offset: "-0500", precision: "minute" } }
 *   ```;
 */
export function parseTM(value: string): ParseResult<TM> {
  const match = TM_FORMAT.exec(value);
  if (match === null) {
    return INVALID_FORMAT;
  }

  const [, hour, minute, second, fraction, offset] = match;
  const data = readTime(hour, minute, second, fraction);
  if (offset !== undefined) {
    data.offset = offset as Offset;
  }
  const issue =
    checkTime(data.hour, data.minute, data.second) ?? checkOffset(data.offset);
  return issue ? { issue, success: false } : { data, success: true };
}

/**
 * Parses an HL7v2 DTM (Date/Time) value,
 * `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`. Also parses TS.1.
 *
 * Fails with `invalid-format` when the value does not follow the format, and
 * with the issue of the first field out of range otherwise, such as
 * `day-out-of-range` for `20250229`. The date is checked as written, before
 * any offset applies. Never throws.
 *
 * @example
 *   ```ts
 *   parseDTM("20260307143045-0500");
 *   // { success: true, data: { year: 2026, month: 3, day: 7, hour: 14,
 *   //   minute: 30, second: 45, offset: "-0500", precision: "second" } }
 *   ```;
 */
export function parseDTM(value: string): ParseResult<DTM> {
  const match = DTM_FORMAT.exec(value);
  if (match === null) {
    return INVALID_FORMAT;
  }

  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  // A time follows the whole date and makes the value as precise as itself.
  const data: DTM =
    hour === undefined
      ? readDate(year, month, day)
      : {
          ...readDate(year, month, day),
          ...readTime(hour, minute, second, fraction),
        };
  if (offset !== undefined) {
    data.offset = offset as Offset;
  }
  const issue =
    checkDate(data.year, data.month, data.day) ??
    checkTime(data.hour, data.minute, data.second) ??
    checkOffset(data.offset);
  return issue ? { issue, success: false } : { data, success: true };
}

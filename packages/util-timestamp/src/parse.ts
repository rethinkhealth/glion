import { checkDate, checkOffset, checkTime } from "./check";
import type { DT, DTM, ParseResult, TM } from "./types";

/** The parts a format matched, by name. */
type Parts = Record<string, string | undefined>;

const INVALID_FORMAT = {
  issue: { code: "invalid-format" },
  success: false,
} as const satisfies ParseResult<never>;

// The HL7v2 formats. Each bracket of the format is an optional group, and
// each part is named after the field it fills.

// DT: YYYY[MM[DD]]
const DT_FORMAT = /^(?<year>\d{4})(?:(?<month>\d{2})(?<day>\d{2})?)?$/;

// TM: HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]
const TM_FORMAT =
  /^(?<hour>\d{2})(?:(?<minute>\d{2})(?:(?<second>\d{2})(?:\.(?<fraction>\d{1,4}))?)?)?(?<offset>[+-]\d{4})?$/;

// DTM: YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
const DTM_FORMAT =
  /^(?<year>\d{4})(?:(?<month>\d{2})(?:(?<day>\d{2})(?:(?<hour>\d{2})(?:(?<minute>\d{2})(?:(?<second>\d{2})(?:\.(?<fraction>\d{1,4}))?)?)?)?)?)?(?<offset>[+-]\d{4})?$/;

/** The date `parts` give. Each part the value gives makes it more precise. */
function readDate(parts: Parts): DT {
  const date: DT = { precision: "year", year: Number(parts.year) };
  if (parts.month !== undefined) {
    date.month = Number(parts.month);
    date.precision = "month";
  }
  if (parts.day !== undefined) {
    date.day = Number(parts.day);
    date.precision = "day";
  }
  return date;
}

/** The time `parts` give. Each part the value gives makes it more precise. */
function readTime(parts: Parts): TM {
  const time: TM = { hour: Number(parts.hour), precision: "hour" };
  if (parts.minute !== undefined) {
    time.minute = Number(parts.minute);
    time.precision = "minute";
  }
  if (parts.second !== undefined) {
    time.second = Number(parts.second);
    time.precision = "second";
  }
  if (parts.fraction !== undefined) {
    time.fraction = parts.fraction;
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
  const parts = DT_FORMAT.exec(value)?.groups;
  if (parts === undefined) {
    return INVALID_FORMAT;
  }

  const data = readDate(parts);
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
  const parts = TM_FORMAT.exec(value)?.groups;
  if (parts === undefined) {
    return INVALID_FORMAT;
  }

  const data = readTime(parts);
  if (parts.offset !== undefined) {
    data.offset = parts.offset;
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
  const parts = DTM_FORMAT.exec(value)?.groups;
  if (parts === undefined) {
    return INVALID_FORMAT;
  }

  // A time follows the whole date and makes the value as precise as itself.
  const data: DTM =
    parts.hour === undefined
      ? readDate(parts)
      : { ...readDate(parts), ...readTime(parts) };
  if (parts.offset !== undefined) {
    data.offset = parts.offset;
  }
  const issue =
    checkDate(data.year, data.month, data.day) ??
    checkTime(data.hour, data.minute, data.second) ??
    checkOffset(data.offset);
  return issue ? { issue, success: false } : { data, success: true };
}

import {
  checkDate,
  checkOffset,
  checkTime,
  numberAt,
  readLayout,
} from "./scan";
import type { DT, DTM, ParseResult, TM } from "./types";

const INVALID_FORMAT = {
  issue: { code: "invalid-format" },
  success: false,
} as const satisfies ParseResult<never>;

const DT_PRECISION = new Map<number, DT["precision"]>([
  [4, "year"],
  [6, "month"],
  [8, "day"],
]);

const TM_PRECISION = new Map<number, TM["precision"]>([
  [2, "hour"],
  [4, "minute"],
  [6, "second"],
]);

const DTM_PRECISION = new Map<number, DTM["precision"]>([
  [4, "year"],
  [6, "month"],
  [8, "day"],
  [10, "hour"],
  [12, "minute"],
  [14, "second"],
]);

const DATE_DIGITS = 8;

interface DateFields {
  year: number;
  month?: number;
  day?: number;
}

interface TimeFields {
  hour?: number;
  minute?: number;
  second?: number;
}

/** The date fields of the first `digits` digits of `value`. */
function readDate(value: string, digits: number): DateFields {
  const date: DateFields = { year: numberAt(value, 0, 4) };
  if (digits >= 6) {
    date.month = numberAt(value, 4, 2);
  }
  if (digits >= 8) {
    date.day = numberAt(value, 6, 2);
  }
  return date;
}

/** The time fields of `digits` digits of `value` from `start`. */
function readTime(value: string, start: number, digits: number): TimeFields {
  const time: TimeFields = {};
  if (digits >= 2) {
    time.hour = numberAt(value, start, 2);
  }
  if (digits >= 4) {
    time.minute = numberAt(value, start + 2, 2);
  }
  if (digits >= 6) {
    time.second = numberAt(value, start + 4, 2);
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
  const layout = readLayout(value);
  const precision = DT_PRECISION.get(layout?.digits ?? 0);
  const datePartsOnly =
    layout?.fraction === undefined && layout?.offset === undefined;
  if (!layout || precision === undefined || !datePartsOnly) {
    return INVALID_FORMAT;
  }

  const date = readDate(value, layout.digits);
  const issue = checkDate(date.year, date.month, date.day);
  if (issue) {
    return { issue, success: false };
  }
  return { data: { ...date, precision }, success: true };
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
  const layout = readLayout(value);
  const precision = TM_PRECISION.get(layout?.digits ?? 0);
  const fractionAllowed =
    layout?.fraction === undefined || precision === "second";
  if (!layout || precision === undefined || !fractionAllowed) {
    return INVALID_FORMAT;
  }

  const { hour = 0, minute, second } = readTime(value, 0, layout.digits);
  const issue = checkTime(hour, minute, second) ?? checkOffset(layout.offset);
  if (issue) {
    return { issue, success: false };
  }

  const data: TM = { hour, precision };
  if (minute !== undefined) {
    data.minute = minute;
  }
  if (second !== undefined) {
    data.second = second;
  }
  if (layout.fraction !== undefined) {
    data.fraction = layout.fraction;
    data.precision = "fraction";
  }
  if (layout.offset !== undefined) {
    data.offset = layout.offset.text;
  }
  return { data, success: true };
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
  const layout = readLayout(value);
  const precision = DTM_PRECISION.get(layout?.digits ?? 0);
  const fractionAllowed =
    layout?.fraction === undefined || precision === "second";
  if (!layout || precision === undefined || !fractionAllowed) {
    return INVALID_FORMAT;
  }

  const date = readDate(value, layout.digits);
  const time = readTime(value, DATE_DIGITS, layout.digits - DATE_DIGITS);
  const issue =
    checkDate(date.year, date.month, date.day) ??
    checkTime(time.hour, time.minute, time.second) ??
    checkOffset(layout.offset);
  if (issue) {
    return { issue, success: false };
  }

  const data: DTM = { ...date, ...time, precision };
  if (layout.fraction !== undefined) {
    data.fraction = layout.fraction;
    data.precision = "fraction";
  }
  if (layout.offset !== undefined) {
    data.offset = layout.offset.text;
  }
  return { data, success: true };
}

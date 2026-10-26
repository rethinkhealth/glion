import type { TimestampIssue } from "./types";

const ZERO = 48;
const NINE = 57;
const DOT = 46;
const PLUS = 43;
const MINUS = 45;

const MAX_FRACTION_DIGITS = 4;
const OFFSET_DIGITS = 4;

const MAX_MONTH = 12;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_SECOND = 59;
const MAX_OFFSET_HOURS = 14;

/** A `+/-ZZZZ` offset. */
export interface Offset {
  /** As written, such as `"-0500"`. */
  text: string;
  hours: number;
  minutes: number;
}

/**
 * Where a value's parts are: its leading digits, the digits after a `.`, and a
 * `+/-ZZZZ` offset.
 */
export interface Layout {
  /** How many digits the value starts with. */
  digits: number;
  fraction: string | undefined;
  offset: Offset | undefined;
}

function countDigits(value: string, start: number): number {
  let end = start;
  for (;;) {
    const code = value.codePointAt(end);
    if (code === undefined || code < ZERO || code > NINE) {
      return end - start;
    }
    end += 1;
  }
}

/**
 * The number written by `count` characters of `value` from `start`, which
 * MUST all be ASCII digits.
 */
export function numberAt(value: string, start: number, count: number): number {
  let result = 0;
  for (let index = start; index < start + count; index += 1) {
    result = result * 10 + ((value.codePointAt(index) ?? ZERO) - ZERO);
  }
  return result;
}

function readOffset(value: string, start: number): Offset | undefined {
  const hasFourDigits =
    countDigits(value, start + 1) === OFFSET_DIGITS &&
    value.length === start + 1 + OFFSET_DIGITS;
  if (!hasFourDigits) {
    return undefined;
  }
  return {
    hours: numberAt(value, start + 1, 2),
    minutes: numberAt(value, start + 3, 2),
    text: value.slice(start),
  };
}

/**
 * The layout of `value`, or `undefined` when it is not digits, optionally
 * followed by `.` and 1 to 4 digits, optionally followed by `+` or `-` and 4
 * digits.
 */
export function readLayout(value: string): Layout | undefined {
  const digits = countDigits(value, 0);
  let end = digits;

  let fraction: string | undefined;
  if (value.codePointAt(end) === DOT) {
    const count = countDigits(value, end + 1);
    if (count === 0 || count > MAX_FRACTION_DIGITS) {
      return undefined;
    }
    fraction = value.slice(end + 1, end + 1 + count);
    end += 1 + count;
  }

  let offset: Offset | undefined;
  const sign = value.codePointAt(end);
  if (sign === PLUS || sign === MINUS) {
    offset = readOffset(value, end);
    if (offset === undefined) {
      return undefined;
    }
    end = value.length;
  }

  return end === value.length ? { digits, fraction, offset } : undefined;
}

/** Whether `year` is a leap year in the Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The number of days in `month` (1 to 12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2: {
      return isLeapYear(year) ? 29 : 28;
    }
    case 4:
    case 6:
    case 9:
    case 11: {
      return 30;
    }
    default: {
      return 31;
    }
  }
}

/**
 * The issue with a date's month or day, or `undefined` when it is a calendar
 * date.
 */
export function checkDate(
  year: number,
  month: number | undefined,
  day: number | undefined
): TimestampIssue | undefined {
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent; with no month there is no day, and the range checks below are false for undefined
  if (month === undefined) {
    return undefined;
  }
  if (month < 1 || month > MAX_MONTH) {
    return { code: "month-out-of-range", month };
  }
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent; `day < 1` and `day > days` are both false for undefined
  if (day === undefined) {
    return undefined;
  }
  const days = daysInMonth(year, month);
  if (day < 1 || day > days) {
    return { code: "day-out-of-range", day, daysInMonth: days, month, year };
  }
  return undefined;
}

/** The issue with a time's fields, or `undefined` when each is in range. */
export function checkTime(
  hour: number | undefined,
  minute: number | undefined,
  second: number | undefined
): TimestampIssue | undefined {
  // Stryker disable next-line ConditionalExpression: equivalent; `hour > MAX_HOUR` is false for undefined
  if (hour !== undefined && hour > MAX_HOUR) {
    return { code: "hour-out-of-range", hour };
  }
  // Stryker disable next-line ConditionalExpression: equivalent; `minute > MAX_MINUTE` is false for undefined
  if (minute !== undefined && minute > MAX_MINUTE) {
    return { code: "minute-out-of-range", minute };
  }
  // Stryker disable next-line ConditionalExpression: equivalent; `second > MAX_SECOND` is false for undefined
  if (second !== undefined && second > MAX_SECOND) {
    return { code: "second-out-of-range", second };
  }
  return undefined;
}

/** The issue with an offset, or `undefined` when it is at most `±1459`. */
export function checkOffset(
  offset: Offset | undefined
): TimestampIssue | undefined {
  const outOfRange =
    offset !== undefined &&
    (offset.hours > MAX_OFFSET_HOURS || offset.minutes > MAX_MINUTE);
  return outOfRange
    ? { code: "offset-out-of-range", offset: offset.text }
    : undefined;
}

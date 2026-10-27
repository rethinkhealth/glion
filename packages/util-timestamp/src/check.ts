import type { TimestampIssue } from "./types";

const MAX_MONTH = 12;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_SECOND = 59;
const MAX_OFFSET_HOURS = 14;

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

/**
 * The issue with an offset, `+/-HHMM`, or `undefined` when it is at most
 * `±1459`.
 */
export function checkOffset(
  offset: string | undefined
): TimestampIssue | undefined {
  if (offset === undefined) {
    return undefined;
  }
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(3));
  return hours > MAX_OFFSET_HOURS || minutes > MAX_MINUTE
    ? { code: "offset-out-of-range", offset }
    : undefined;
}

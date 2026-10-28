import type { Precision } from "./precision";

/** An offset from UTC, written `+/-HHMM`: `"-0500"`. */
export type Offset = `${"+" | "-"}${number}`;

/**
 * An HL7v2 DT (Date) value, written `YYYY[MM[DD]]`.
 *
 * Holds the fields the value gives and nothing more: `202603` has no `day`.
 */
export interface DT {
  year: number;
  /** 1 to 12. */
  month?: number;
  /** 1 to the number of days in `month`. */
  day?: number;
  /** The last field the value gives: `202603` is `month`. */
  precision: Extract<Precision, "year" | "month" | "day">;
}

/**
 * An HL7v2 TM (Time) value, written `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`.
 *
 * Holds the fields the value gives and nothing more: `1430` has no `second`.
 */
export interface TM {
  /** 0 to 23. */
  hour: number;
  /** 0 to 59. */
  minute?: number;
  /** 0 to 59. */
  second?: number;
  /**
   * The 1 to 4 digits after the seconds, as written: `"1230"` for `.1230`.
   * Present when `precision` is `fraction`.
   */
  fraction?: string;
  /**
   * The offset from UTC as written, `+/-HHMM`: `"-0500"`. Absent when the
   * value gives no offset. From HL7v2 v2.9, `"-0000"` is UTC with no local
   * time zone known, and `"+0000"` a local time zone at offset zero.
   */
  offset?: Offset;
  /**
   * The last field the value gives: `1430` is `minute`, and `143045.12` is
   * `fraction`. The offset does not count.
   */
  precision: Extract<Precision, "hour" | "minute" | "second" | "fraction">;
}

/**
 * An HL7v2 DTM (Date/Time) value, written
 * `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`. Also the value of TS.1.
 *
 * Holds the fields the value gives and nothing more: `20260307` has no `hour`.
 * The fields are the sender's local time; `offset`, when present, says how far
 * that is from UTC.
 */
export interface DTM {
  year: number;
  /** 1 to 12. */
  month?: number;
  /** 1 to the number of days in `month`. */
  day?: number;
  /** 0 to 23. */
  hour?: number;
  /** 0 to 59. */
  minute?: number;
  /** 0 to 59. */
  second?: number;
  /**
   * The 1 to 4 digits after the seconds, as written: `"1230"` for `.1230`.
   * Present when `precision` is `fraction`.
   */
  fraction?: string;
  /**
   * The offset from UTC as written, `+/-HHMM`: `"-0500"`. Absent when the
   * value gives no offset. From HL7v2 v2.9, `"-0000"` is UTC with no local
   * time zone known, and `"+0000"` a local time zone at offset zero.
   */
  offset?: Offset;
  /**
   * The last field the value gives, from `year` to `fraction`: `202603-0500`
   * is `month`, and `20260307143045.12` is `fraction`. The offset does not
   * count.
   */
  precision: Precision;
}

/**
 * Why a value is not a valid DT, TM, or DTM.
 *
 * - `invalid-format`: the characters do not follow the datatype's format.
 * - `month-out-of-range`: the month is not 1 to 12.
 * - `day-out-of-range`: the day is 0, or past the last day of its month.
 * - `hour-out-of-range`: the hour is not 0 to 23.
 * - `minute-out-of-range`: the minute is not 0 to 59.
 * - `second-out-of-range`: the second is not 0 to 59.
 * - `offset-out-of-range`: the offset's hours are over 14, or its minutes over 59.
 */
export type TimestampIssue =
  | { code: "invalid-format" }
  | { code: "month-out-of-range"; month: number }
  | {
      code: "day-out-of-range";
      year: number;
      month: number;
      day: number;
      /** The number of days in `month` of `year`. */
      daysInMonth: number;
    }
  | { code: "hour-out-of-range"; hour: number }
  | { code: "minute-out-of-range"; minute: number }
  | { code: "second-out-of-range"; second: number }
  | {
      code: "offset-out-of-range";
      /** The offset as written, such as `"+1500"`. */
      offset: string;
    };

/** The value parsed, or the issue that stopped it. */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; issue: TimestampIssue };

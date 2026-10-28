import { TimestampPrecisionError } from "./errors";
import type { Precision } from "./precision";
import type { DT, DTM, TM } from "./types";

// The fields of each datatype, in order, and the digits each is written in.
const DATE_FIELDS = [
  ["year", 4],
  ["month", 2],
  ["day", 2],
] as const;
const TIME_FIELDS = [
  ["hour", 2],
  ["minute", 2],
  ["second", 2],
] as const;
const DATE_TIME_FIELDS = [...DATE_FIELDS, ...TIME_FIELDS] as const;

/**
 * The fields of `value` from the first in `fields` down to its precision, and
 * the fraction when the precision is `fraction`. Throws a
 * {@link TimestampPrecisionError} when one of them is missing.
 */
function writeFields(
  value: Partial<DTM> & { precision: Precision },
  fields: typeof DATE_FIELDS | typeof TIME_FIELDS | typeof DATE_TIME_FIELDS
): string {
  let text = "";
  for (const [field, width] of fields) {
    const number = value[field];
    if (number === undefined) {
      throw new TimestampPrecisionError(field, value.precision);
    }
    text += String(number).padStart(width, "0");
    if (field === value.precision) {
      return text;
    }
  }
  // Every whole field is written: the precision is `fraction`.
  if (value.fraction === undefined) {
    throw new TimestampPrecisionError("fraction", value.precision);
  }
  return `${text}.${value.fraction}`;
}

/**
 * Writes a DT as HL7v2 text, `YYYY[MM[DD]]`, from the year down to its
 * precision.
 *
 * @example
 *   ```ts
 *   formatDT({ year: 2026, month: 3, precision: "month" }); // "202603"
 *   ```;
 *
 * @throws {TimestampPrecisionError} When `date` does not give a field its
 *   precision includes.
 */
export function formatDT(date: DT): string {
  return writeFields(date, DATE_FIELDS);
}

/**
 * Writes a TM as HL7v2 text, `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`, from the hour
 * down to its precision, then its offset.
 *
 * @example
 *   ```ts
 *   formatTM({ hour: 14, minute: 30, offset: "-0500", precision: "minute" }); // "1430-0500"
 *   ```;
 *
 * @throws {TimestampPrecisionError} When `time` does not give a field its
 *   precision includes.
 */
export function formatTM(time: TM): string {
  return `${writeFields(time, TIME_FIELDS)}${time.offset ?? ""}`;
}

/**
 * Writes a DTM as HL7v2 text, `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`,
 * from the year down to its precision, then its offset.
 *
 * @example
 *   ```ts
 *   formatDTM({ year: 2026, month: 3, day: 7, hour: 14, precision: "hour" }); // "2026030714"
 *   ```;
 *
 * @throws {TimestampPrecisionError} When `dateTime` does not give a field its
 *   precision includes.
 */
export function formatDTM(dateTime: DTM): string {
  return `${writeFields(dateTime, DATE_TIME_FIELDS)}${dateTime.offset ?? ""}`;
}

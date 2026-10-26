import type { DT, DTM, TM } from "./types";

const MINUTES_PER_HOUR = 60;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function formatOffset(offset: number): string {
  const sign = offset < 0 || Object.is(offset, -0) ? "-" : "+";
  const magnitude = Math.abs(offset);
  return `${sign}${pad(Math.floor(magnitude / MINUTES_PER_HOUR), 2)}${pad(magnitude % MINUTES_PER_HOUR, 2)}`;
}

function writeTime(
  time: Pick<DTM, "hour" | "minute" | "second" | "fraction" | "offset">
): string {
  let text = "";
  if (time.hour !== undefined) {
    text += pad(time.hour, 2);
  }
  if (time.minute !== undefined) {
    text += pad(time.minute, 2);
  }
  if (time.second !== undefined) {
    text += pad(time.second, 2);
  }
  if (time.fraction !== undefined) {
    text += `.${time.fraction}`;
  }
  if (time.offset !== undefined) {
    text += formatOffset(time.offset);
  }
  return text;
}

function writeDate(date: Pick<DTM, "year" | "month" | "day">): string {
  let text = pad(date.year, 4);
  if (date.month !== undefined) {
    text += pad(date.month, 2);
  }
  if (date.day !== undefined) {
    text += pad(date.day, 2);
  }
  return text;
}

/**
 * Writes a DT as HL7v2 text, `YYYY[MM[DD]]`, with the fields `date` has.
 *
 * @example
 *   ```ts
 *   formatDT({ year: 2026, month: 3, precision: "month" }); // "202603"
 *   ```;
 */
export function formatDT(date: DT): string {
  return writeDate(date);
}

/**
 * Writes a TM as HL7v2 text, `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`, with the
 * fields `time` has. An `offset` of `0` is written `+0000`, and `-0` is
 * written `-0000`.
 *
 * @example
 *   ```ts
 *   formatTM({ hour: 14, minute: 30, offset: -300, precision: "minute" }); // "1430-0500"
 *   ```;
 */
export function formatTM(time: TM): string {
  return writeTime(time);
}

/**
 * Writes a DTM as HL7v2 text, `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`,
 * with the fields `dateTime` has. An `offset` of `0` is written `+0000`, and
 * `-0` is written `-0000`.
 *
 * @example
 *   ```ts
 *   formatDTM({ year: 2026, month: 3, day: 7, hour: 14, precision: "hour" }); // "2026030714"
 *   ```;
 */
export function formatDTM(dateTime: DTM): string {
  return `${writeDate(dateTime)}${writeTime(dateTime)}`;
}

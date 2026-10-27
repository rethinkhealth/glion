import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatDT, formatDTM, formatTM } from "../src/format";
import { parseDT, parseDTM, parseTM } from "../src/parse";

const digits = (count: number) =>
  fc
    .array(fc.integer({ max: 9, min: 0 }), {
      maxLength: count,
      minLength: count,
    })
    .map((values) => values.join(""));

const pairInRange = (max: number, min = 0) =>
  fc.integer({ max, min }).map((value) => String(value).padStart(2, "0"));

const fraction = fc
  .integer({ max: 4, min: 1 })
  .chain((count) => digits(count))
  .map((value) => `.${value}`);

const offset = fc
  .tuple(fc.constantFrom("+", "-"), pairInRange(14), pairInRange(59))
  .map(([sign, hours, minutes]) => `${sign}${hours}${minutes}`);

const date = fc
  .date({ max: new Date("9999-12-31"), min: new Date("0000-01-01") })
  .map((value) => value.toISOString().slice(0, 10).replaceAll("-", ""));

const time = fc.tuple(pairInRange(23), pairInRange(59), pairInRange(59));

/** A valid DT: a date cut to 4, 6, or 8 digits. */
const dtText = fc
  .tuple(date, fc.constantFrom(4, 6, 8))
  .map(([value, length]) => value.slice(0, length));

/** A valid TM: 1 to 3 pairs, a fraction only after seconds, any offset. */
const tmText = fc
  .tuple(time, fc.constantFrom(1, 2, 3), fc.option(fraction), fc.option(offset))
  .map(
    ([pairs, count, fractionText, offsetText]) =>
      `${pairs.slice(0, count).join("")}${count === 3 ? (fractionText ?? "") : ""}${offsetText ?? ""}`
  );

/** A valid DTM: a date and time cut to 4 to 14 digits, then the TM tail. */
const dtmText = fc
  .tuple(
    date,
    time,
    fc.constantFrom(4, 6, 8, 10, 12, 14),
    fc.option(fraction),
    fc.option(offset)
  )
  .map(
    ([dateText, pairs, length, fractionText, offsetText]) =>
      `${`${dateText}${pairs.join("")}`.slice(0, length)}${length === 14 ? (fractionText ?? "") : ""}${offsetText ?? ""}`
  );

// Each valid value parses, and formatting what it parsed to writes the value
// back exactly, at the precision it was written with.
describe("format of parse is the value", () => {
  // Mutant: `writeDate` writes the year without padding it to four digits.
  // Fails on `"0099"`.
  it("for every valid DT", () => {
    fc.assert(
      fc.property(dtText, (value) => {
        const result = parseDT(value);
        expect(result.success && formatDT(result.data)).toBe(value);
      }),
      { examples: [["0099"]] }
    );
  });

  // Mutant: `writeTime` leaves the offset out. Fails on `"09-0545"`.
  it("for every valid TM", () => {
    fc.assert(
      fc.property(tmText, (value) => {
        const result = parseTM(value);
        expect(result.success && formatTM(result.data)).toBe(value);
      }),
      { examples: [["09-0545"]] }
    );
  });

  // Mutant: `writeTime` drops the fraction of a second. Fails on
  // `"20260307120000.25"`.
  it("for every valid DTM", () => {
    fc.assert(
      fc.property(dtmText, (value) => {
        const result = parseDTM(value);
        expect(result.success && formatDTM(result.data)).toBe(value);
      }),
      { examples: [["20260307120000.25"], ["2026030712-0000"]] }
    );
  });
});

// A year drawn uniformly is rarely a century, and a day drawn uniformly is
// rarely past the 28th, so half the draws come from the years whose leap rule
// differs (multiples of 4, 100, and 400) and the days a month may not have.
const arbYear = fc.oneof(
  fc.integer({ max: 9999, min: 0 }),
  fc.integer({ max: 2499, min: 0 }).map((value) => value * 4),
  fc.integer({ max: 99, min: 0 }).map((value) => value * 100),
  fc.integer({ max: 24, min: 0 }).map((value) => value * 400)
);
const arbDay = fc.oneof(
  fc.integer({ max: 31, min: 1 }),
  fc.integer({ max: 31, min: 28 })
);

describe("parseDT accepts exactly the days of the calendar", () => {
  // A DT names a day exactly when the proleptic Gregorian calendar has it.
  //
  // Mutant: `isLeapYear` treats every year divisible by 4 as a leap year.
  // Fails on February 29 of 1900.
  it("agrees with the proleptic Gregorian calendar for every year, month, and day 1 to 31", () => {
    fc.assert(
      fc.property(
        arbYear,
        fc.integer({ max: 12, min: 1 }),
        arbDay,
        (year, month, day) => {
          const calendar = new Date(0);
          calendar.setUTCFullYear(year, month - 1, day);
          const exists = calendar.getUTCDate() === day;
          const value = `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
          expect(parseDT(value).success).toBe(exists);
        }
      ),
      {
        examples: [
          [1900, 2, 29],
          [2000, 2, 29],
        ],
        numRuns: 1000,
      }
    );
  });
});

describe("formatDTM", () => {
  it("writes the offset as given", () => {
    expect(
      formatDTM({
        day: 7,
        hour: 12,
        month: 3,
        offset: "-0000",
        precision: "hour",
        year: 2026,
      })
    ).toBe("2026030712-0000");
  });

  it("pads a year below 1000 to four digits", () => {
    expect(formatDTM({ precision: "year", year: 99 })).toBe("0099");
  });
});

import { describe, expect, it } from "vitest";

import { parseDT, parseDTM, parseTM } from "../src/parse";

describe("parseDT", () => {
  it("reads a year", () => {
    expect(parseDT("2026")).toStrictEqual({
      data: { precision: "year", year: 2026 },
      success: true,
    });
  });

  it("reads a year and month", () => {
    expect(parseDT("202603")).toStrictEqual({
      data: { month: 3, precision: "month", year: 2026 },
      success: true,
    });
  });

  it("reads a full date", () => {
    expect(parseDT("20260307")).toStrictEqual({
      data: { day: 7, month: 3, precision: "day", year: 2026 },
      success: true,
    });
  });

  it("leaves out the fields the value does not give", () => {
    const result = parseDT("202603");
    expect(result.success && Object.keys(result.data).toSorted()).toStrictEqual(
      ["month", "precision", "year"]
    );
  });

  it.each([
    ["", "the empty string"],
    ["26", "a two-digit year"],
    ["20263", "an odd number of digits"],
    ["2026030714", "a time"],
    ["2026-03-07", "ISO 8601 separators"],
    ["20260307-0500", "an offset"],
    ["20260307.1", "a fraction"],
    [" 20260307", "a leading space"],
    ["2026030A", "a letter in place of a digit"],
    ["2026:307", "a colon in place of a digit"],
  ])("rejects %j, %s, as invalid-format", (value) => {
    expect(parseDT(value)).toStrictEqual({
      issue: { code: "invalid-format" },
      success: false,
    });
  });

  it("rejects month 13", () => {
    expect(parseDT("202613")).toStrictEqual({
      issue: { code: "month-out-of-range", month: 13 },
      success: false,
    });
  });

  it("rejects month 00", () => {
    expect(parseDT("202600")).toStrictEqual({
      issue: { code: "month-out-of-range", month: 0 },
      success: false,
    });
  });

  it("rejects day 00", () => {
    expect(parseDT("20260300")).toStrictEqual({
      issue: {
        code: "day-out-of-range",
        day: 0,
        daysInMonth: 31,
        month: 3,
        year: 2026,
      },
      success: false,
    });
  });

  it("rejects the 31st of a 30-day month", () => {
    expect(parseDT("20260431")).toStrictEqual({
      issue: {
        code: "day-out-of-range",
        day: 31,
        daysInMonth: 30,
        month: 4,
        year: 2026,
      },
      success: false,
    });
  });
});

describe("February 29 follows the Gregorian leap-year rule", () => {
  it("exists in a year divisible by 4", () => {
    expect(parseDT("20240229").success).toBe(true);
  });

  it("does not exist in a year not divisible by 4", () => {
    expect(parseDT("20250229")).toStrictEqual({
      issue: {
        code: "day-out-of-range",
        day: 29,
        daysInMonth: 28,
        month: 2,
        year: 2025,
      },
      success: false,
    });
  });

  it("does not exist in a century year not divisible by 400", () => {
    expect(parseDT("19000229")).toStrictEqual({
      issue: {
        code: "day-out-of-range",
        day: 29,
        daysInMonth: 28,
        month: 2,
        year: 1900,
      },
      success: false,
    });
  });

  it("exists in a century year divisible by 400", () => {
    expect(parseDT("20000229").success).toBe(true);
  });

  it("is checked in a DTM as written, before the offset applies", () => {
    expect(parseDTM("20240229235959-1400").success).toBe(true);
    expect(parseDTM("20250229000000+1400")).toStrictEqual({
      issue: {
        code: "day-out-of-range",
        day: 29,
        daysInMonth: 28,
        month: 2,
        year: 2025,
      },
      success: false,
    });
  });
});

describe("parseTM", () => {
  it("reads an hour", () => {
    expect(parseTM("14")).toStrictEqual({
      data: { hour: 14, precision: "hour" },
      success: true,
    });
  });

  it("reads hours and minutes with an offset west of UTC", () => {
    expect(parseTM("1430-0500")).toStrictEqual({
      data: { hour: 14, minute: 30, offset: -300, precision: "minute" },
      success: true,
    });
  });

  it("reads seconds with a fraction and an offset east of UTC", () => {
    expect(parseTM("143045.1230+0545")).toStrictEqual({
      data: {
        fraction: "1230",
        hour: 14,
        minute: 30,
        offset: 345,
        precision: "second",
        second: 45,
      },
      success: true,
    });
  });

  it("reads midnight", () => {
    expect(parseTM("0000")).toStrictEqual({
      data: { hour: 0, minute: 0, precision: "minute" },
      success: true,
    });
  });

  it.each([
    ["", "the empty string"],
    ["1", "one digit"],
    ["14301", "an odd number of digits"],
    ["14:30", "ISO 8601 separators"],
    ["1430.5", "a fraction without seconds"],
    ["143045.", "a dot without digits"],
    ["143045.12345", "five fraction digits"],
    ["1430-05", "a two-digit offset"],
    ["1430-05:00", "an ISO 8601 offset"],
    ["1430Z", "a Z suffix"],
    ["1430-05A0", "a letter in the offset"],
    ["1430+0:00", "a colon in the offset"],
  ])("rejects %j, %s, as invalid-format", (value) => {
    expect(parseTM(value)).toStrictEqual({
      issue: { code: "invalid-format" },
      success: false,
    });
  });

  it("rejects hour 24", () => {
    expect(parseTM("2400")).toStrictEqual({
      issue: { code: "hour-out-of-range", hour: 24 },
      success: false,
    });
  });

  it("rejects minute 60", () => {
    expect(parseTM("1460")).toStrictEqual({
      issue: { code: "minute-out-of-range", minute: 60 },
      success: false,
    });
  });

  it("rejects second 60", () => {
    expect(parseTM("235960")).toStrictEqual({
      issue: { code: "second-out-of-range", second: 60 },
      success: false,
    });
  });

  it("accepts the largest offsets, ±1400", () => {
    expect(parseTM("12+1400").success).toBe(true);
    expect(parseTM("12-1400").success).toBe(true);
  });

  it("rejects an offset of more than 14 hours", () => {
    expect(parseTM("12+1500")).toStrictEqual({
      issue: { code: "offset-out-of-range", offset: "+1500" },
      success: false,
    });
  });

  it("rejects offset minutes of 60", () => {
    expect(parseTM("12-0560")).toStrictEqual({
      issue: { code: "offset-out-of-range", offset: "-0560" },
      success: false,
    });
  });

  // From v2.9, `-0000` is UTC with no local time zone known, and `+0000` a
  // local time zone at offset zero; the sign of zero keeps them apart.
  it("reads -0000 as offset -0 and +0000 as offset 0", () => {
    expect(parseTM("12-0000")).toStrictEqual({
      data: { hour: 12, offset: -0, precision: "hour" },
      success: true,
    });
    expect(parseTM("12+0000")).toStrictEqual({
      data: { hour: 12, offset: 0, precision: "hour" },
      success: true,
    });
  });
});

describe("parseDTM", () => {
  it.each([
    ["2026", { precision: "year", year: 2026 }],
    ["202603", { month: 3, precision: "month", year: 2026 }],
    ["20260307", { day: 7, month: 3, precision: "day", year: 2026 }],
    [
      "2026030714",
      { day: 7, hour: 14, month: 3, precision: "hour", year: 2026 },
    ],
    [
      "202603071430",
      {
        day: 7,
        hour: 14,
        minute: 30,
        month: 3,
        precision: "minute",
        year: 2026,
      },
    ],
    [
      "20260307143045",
      {
        day: 7,
        hour: 14,
        minute: 30,
        month: 3,
        precision: "second",
        second: 45,
        year: 2026,
      },
    ],
  ])("reads %j", (value, data) => {
    expect(parseDTM(value)).toStrictEqual({ data, success: true });
  });

  it("reads a fraction and an offset", () => {
    expect(parseDTM("20260307143045.12-0500")).toStrictEqual({
      data: {
        day: 7,
        fraction: "12",
        hour: 14,
        minute: 30,
        month: 3,
        offset: -300,
        precision: "second",
        second: 45,
        year: 2026,
      },
      success: true,
    });
  });

  it("reads an offset on a value of any precision", () => {
    expect(parseDTM("20260307-0500")).toStrictEqual({
      data: { day: 7, month: 3, offset: -300, precision: "day", year: 2026 },
      success: true,
    });
  });

  it("reads a year below 1000 as written", () => {
    expect(parseDTM("0099")).toStrictEqual({
      data: { precision: "year", year: 99 },
      success: true,
    });
  });

  it.each([
    ["", "the empty string"],
    ["202", "three digits"],
    ["2026030714304512", "sixteen digits"],
    ["20260307T1430", "an ISO 8601 T"],
    ["202603071430.5", "a fraction without seconds"],
    ["20260307143045.12345", "five fraction digits"],
    ["-0500", "an offset without a date"],
    ["20260307143045-05000", "a five-digit offset"],
    ["20260307143045-0500 ", "a trailing space"],
  ])("rejects %j, %s, as invalid-format", (value) => {
    expect(parseDTM(value)).toStrictEqual({
      issue: { code: "invalid-format" },
      success: false,
    });
  });

  it("reports the date before the time", () => {
    expect(parseDTM("20261307250000")).toStrictEqual({
      issue: { code: "month-out-of-range", month: 13 },
      success: false,
    });
  });

  it("reports the time before the offset", () => {
    expect(parseDTM("2026030725+1500")).toStrictEqual({
      issue: { code: "hour-out-of-range", hour: 25 },
      success: false,
    });
  });

  it("rejects an offset out of range", () => {
    expect(parseDTM("20260307+1500")).toStrictEqual({
      issue: { code: "offset-out-of-range", offset: "+1500" },
      success: false,
    });
  });
});

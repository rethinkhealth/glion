import { describe, expect, it } from "vitest";

import { applyTransform } from "../src/transforms";

describe("hl7-date", () => {
  it("converts a full HL7v2 date", () => {
    expect(applyTransform("hl7-date", "19781103")).toStrictEqual({
      ok: true,
      value: "1978-11-03",
    });
  });

  it("keeps the precision of a year and month", () => {
    expect(applyTransform("hl7-date", "197811")).toStrictEqual({
      ok: true,
      value: "1978-11",
    });
  });

  it("keeps the precision of a year", () => {
    expect(applyTransform("hl7-date", "1978")).toStrictEqual({
      ok: true,
      value: "1978",
    });
  });

  it("reports a value that is not an HL7v2 date", () => {
    expect(applyTransform("hl7-date", "03/11/1978")).toStrictEqual({
      cause: "hl7-date",
      ok: false,
    });
  });

  it("reports a date/time where a date is required", () => {
    expect(applyTransform("hl7-date", "19781103120000")).toStrictEqual({
      cause: "hl7-date",
      ok: false,
    });
  });
});

describe("hl7-datetime", () => {
  it("converts a date and time to the second", () => {
    expect(applyTransform("hl7-datetime", "20261014080000")).toStrictEqual({
      ok: true,
      value: "2026-10-14T08:00:00",
    });
  });

  it("converts a date and time to the minute", () => {
    expect(applyTransform("hl7-datetime", "202610140800")).toStrictEqual({
      ok: true,
      value: "2026-10-14T08:00:00",
    });
  });

  it("converts a date with no time", () => {
    expect(applyTransform("hl7-datetime", "20261014")).toStrictEqual({
      ok: true,
      value: "2026-10-14",
    });
  });

  it("reports a value shorter than a date", () => {
    expect(applyTransform("hl7-datetime", "202610")).toStrictEqual({
      cause: "hl7-datetime",
      ok: false,
    });
  });
});

describe("hl7-datetime to the hour", () => {
  it("fills the minute and second HL7v2 left off", () => {
    expect(applyTransform("hl7-datetime", "2026101408")).toStrictEqual({
      ok: true,
      value: "2026-10-14T08:00:00",
    });
  });
});

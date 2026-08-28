import {
  Range,
  RangeParseError,
  satisfies,
  VersionParseError,
} from "../src/index";

describe(satisfies, () => {
  it("matches with AND conditions", () => {
    expect(satisfies("2.5", ">=2.3 <3.0")).toBeTruthy();
    expect(satisfies("2.2.9", ">=2.3 <3.0")).toBeFalsy();
    expect(satisfies("3.0.0", ">=2.3 <3.0")).toBeFalsy();
  });

  it("handles exact version matches", () => {
    expect(satisfies("2.3.1", "=2.3.1")).toBeTruthy();
    expect(satisfies("2.3.1", "2.3.1")).toBeTruthy();
    expect(satisfies("2.3.0", "2.3.1")).toBeFalsy();
  });

  it("handles empty range", () => {
    expect(satisfies("2.3.1", "")).toBeFalsy();
  });

  it("handles single comparators", () => {
    expect(satisfies("2.5.1", ">=2.0")).toBeTruthy();
    expect(satisfies("2.5.1", "<3.0")).toBeTruthy();
    expect(satisfies("2.5.1", ">2.5.0")).toBeTruthy();
    expect(satisfies("2.5.1", "<=2.5.1")).toBeTruthy();
  });

  it("handles multiple AND conditions", () => {
    expect(satisfies("2.5.1", ">=2.0 <3.0 >=2.5")).toBeTruthy();
    expect(satisfies("2.4.0", ">=2.0 <3.0 >=2.5")).toBeFalsy();
  });

  it("throws on invalid version", () => {
    expect(() => satisfies("HELLO", ">=2.0")).toThrow(VersionParseError);
    expect(() => satisfies("a.b.c", ">=2.0")).toThrow(VersionParseError);
  });

  it("throws on invalid range", () => {
    expect(() => satisfies("2.3", ">=2.11 fssds")).toThrow(RangeParseError);
    expect(() => satisfies("2.3", "INVALID")).toThrow(RangeParseError);
    expect(() => satisfies("2.3", ">=HELLO")).toThrow(RangeParseError);
  });

  it("accepts Range objects", () => {
    const range = new Range(">=2.0 <3.0");
    expect(satisfies("2.5.1", range)).toBeTruthy();
    expect(satisfies("2.0.0", range)).toBeTruthy();
    expect(satisfies("2.9.9", range)).toBeTruthy();
    expect(satisfies("1.9.9", range)).toBeFalsy();
    expect(satisfies("3.0.0", range)).toBeFalsy();
  });
});

describe(Range, () => {
  it("parses range expression", () => {
    const range = new Range(">=2.0 <3.0");
    expect(range.raw).toBe(">=2.0 <3.0");
    expect(range.comparators).toHaveLength(2);
  });

  it("tests versions via test method", () => {
    const range = new Range(">=2.0 <3.0");
    expect(range.test("2.5.1")).toBeTruthy();
    expect(range.test("2.0.0")).toBeTruthy();
    expect(range.test("2.9.9")).toBeTruthy();
    expect(range.test("1.9.9")).toBeFalsy();
    expect(range.test("3.0.0")).toBeFalsy();
  });

  it("handles empty range", () => {
    const range = new Range("");
    expect(range.test("2.5.1")).toBeFalsy();
  });

  it("handles single comparator", () => {
    const range = new Range(">=2.5");
    expect(range.test("2.5.0")).toBeTruthy();
    expect(range.test("2.6.0")).toBeTruthy();
    expect(range.test("2.4.0")).toBeFalsy();
  });

  it("handles exact version", () => {
    const range = new Range("2.5.1");
    expect(range.test("2.5.1")).toBeTruthy();
    expect(range.test("2.5.0")).toBeFalsy();
    expect(range.test("2.5.2")).toBeFalsy();
  });

  it("throws on invalid range expression", () => {
    expect(() => new Range("INVALID")).toThrow(RangeParseError);
    expect(() => new Range(">=HELLO")).toThrow(RangeParseError);
  });

  it("throws on too long range", () => {
    const longRange = ">=2.0 ".repeat(200);
    expect(() => new Range(longRange)).toThrow(RangeParseError);
  });
});

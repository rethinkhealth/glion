import {
  parse,
  RangeParseError,
  satisfies,
  VersionParseError,
} from "../src/index";

describe("reDoS protection", () => {
  it("rejects version strings that are too long", () => {
    const longVersion = "1".repeat(101);
    expect(() => parse(longVersion)).toThrow(VersionParseError);
    expect(() => parse(longVersion)).toThrow("version string too long");
  });

  it("rejects range strings that are too long", () => {
    const longRange = ">=2.0 ".repeat(200);
    expect(() => satisfies("2.5", longRange)).toThrow(RangeParseError);
    expect(() => satisfies("2.5", longRange)).toThrow("range string too long");
  });

  it("accepts strings at the length boundary", () => {
    // Valid version string at exactly 100 characters
    const maxVersion = `2.5.1${" ".repeat(95)}`; // 5 chars + 95 spaces = 100
    expect(parse(maxVersion)).toStrictEqual({ major: 2, minor: 5, patch: 1 });
  });
});

describe("integer overflow protection", () => {
  it("rejects version components that exceed max safe integer", () => {
    const maxSafe = 2 ** 31 - 1;
    const tooLarge = maxSafe + 1;

    expect(() => parse(`${tooLarge}.0.0`)).toThrow(VersionParseError);
    expect(() => parse(`${tooLarge}.0.0`)).toThrow("exceeds maximum");

    expect(() => parse(`0.${tooLarge}.0`)).toThrow(VersionParseError);
    expect(() => parse(`0.${tooLarge}.0`)).toThrow("exceeds maximum");

    expect(() => parse(`0.0.${tooLarge}`)).toThrow(VersionParseError);
    expect(() => parse(`0.0.${tooLarge}`)).toThrow("exceeds maximum");
  });

  it("accepts version components at max safe integer boundary", () => {
    const maxSafe = 2 ** 31 - 1;
    expect(parse(`${maxSafe}.0.0`)).toStrictEqual({
      major: maxSafe,
      minor: 0,
      patch: 0,
    });
    expect(parse(`0.${maxSafe}.0`)).toStrictEqual({
      major: 0,
      minor: maxSafe,
      patch: 0,
    });
    expect(parse(`0.0.${maxSafe}`)).toStrictEqual({
      major: 0,
      minor: 0,
      patch: maxSafe,
    });
  });
});

describe("edge cases", () => {
  it("handles zero version", () => {
    expect(parse("0.0.0")).toStrictEqual({ major: 0, minor: 0, patch: 0 });
  });

  it("handles whitespace variations", () => {
    expect(parse("  2.5.1  ")).toStrictEqual({ major: 2, minor: 5, patch: 1 });
    expect(parse("\t2.5\n")).toStrictEqual({ major: 2, minor: 5, patch: 0 });
  });

  it("rejects empty string", () => {
    expect(() => parse("")).toThrow(VersionParseError);
  });
});

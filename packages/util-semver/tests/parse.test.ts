import {
  clean,
  increment,
  parse,
  VersionParseError,
  valid,
} from "../src/index";

describe(parse, () => {
  it("parses versions with defaults", () => {
    expect(parse("2")).toStrictEqual({ major: 2, minor: 0, patch: 0 });
    expect(parse("2.3")).toStrictEqual({ major: 2, minor: 3, patch: 0 });
    expect(parse("2.3.1")).toStrictEqual({ major: 2, minor: 3, patch: 1 });
  });

  it("handles whitespace", () => {
    expect(parse("  2.5.1  ")).toStrictEqual({ major: 2, minor: 5, patch: 1 });
    expect(parse("\t2.5\n")).toStrictEqual({ major: 2, minor: 5, patch: 0 });
  });

  it("throws on invalid version", () => {
    expect(() => parse("2.11.0.0")).toThrow(VersionParseError);
    expect(() => parse("HELLO")).toThrow(VersionParseError);
    expect(() => parse("a.b.c")).toThrow(VersionParseError);
    expect(() => parse("")).toThrow(VersionParseError);
    expect(() => parse(".")).toThrow(VersionParseError);
    expect(() => parse("2.")).toThrow(VersionParseError);
    expect(() => parse(".2")).toThrow(VersionParseError);
    expect(() => parse("2..3")).toThrow(VersionParseError);
  });
});

describe(clean, () => {
  it("cleans to canonical format", () => {
    expect(clean("2")).toBe("2.0.0");
    expect(clean(" 2.3 ")).toBe("2.3.0");
    expect(clean("2.3.1")).toBe("2.3.1");
  });

  it("throws on invalid input", () => {
    expect(() => clean("2.")).toThrow(VersionParseError);
    expect(() => clean("a.b.c")).toThrow(VersionParseError);
  });
});

describe(valid, () => {
  it("validates version strings", () => {
    expect(valid("2")).toBeTruthy();
    expect(valid("2.3")).toBeTruthy();
    expect(valid("2.3.1")).toBeTruthy();
    expect(valid("2.")).toBeFalsy();
    expect(valid("a.b.c")).toBeFalsy();
  });
});

describe(increment, () => {
  it("increments major version", () => {
    expect(increment("2.5.1", "major")).toBe("3.0.0");
    expect(increment("1.9.9", "major")).toBe("2.0.0");
    expect(increment("0.1.2", "major")).toBe("1.0.0");
  });

  it("increments minor version", () => {
    expect(increment("2.5.1", "minor")).toBe("2.6.0");
    expect(increment("1.9.9", "minor")).toBe("1.10.0");
    expect(increment("0.0.1", "minor")).toBe("0.1.0");
  });

  it("increments patch version", () => {
    expect(increment("2.5.1", "patch")).toBe("2.5.2");
    expect(increment("1.9.9", "patch")).toBe("1.9.10");
    expect(increment("0.0.0", "patch")).toBe("0.0.1");
  });

  it("works with partial versions", () => {
    expect(increment("2", "major")).toBe("3.0.0");
    expect(increment("2", "minor")).toBe("2.1.0");
    expect(increment("2", "patch")).toBe("2.0.1");
    expect(increment("2.5", "patch")).toBe("2.5.1");
  });

  it("throws on invalid version", () => {
    expect(() => increment("HELLO", "major")).toThrow(VersionParseError);
    expect(() => increment("2.", "minor")).toThrow(VersionParseError);
  });
});

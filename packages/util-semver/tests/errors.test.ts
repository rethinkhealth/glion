import {
  parse,
  RangeParseError,
  satisfies,
  VersionParseError,
} from "../src/index";

describe(VersionParseError, () => {
  it("includes structured data", () => {
    try {
      parse("HELLO");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(VersionParseError);
      expect((error as VersionParseError).input).toBe("HELLO");
      expect((error as VersionParseError).reason).toBe(
        "expected format: major.minor.patch (e.g., '2.5.1' or '2.3')"
      );
      expect((error as VersionParseError).name).toBe("VersionParseError");
    }
  });

  it("has proper message format", () => {
    try {
      parse("HELLO");
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Invalid version format ('HELLO') — expected format: major.minor.patch (e.g., '2.5.1' or '2.3')"
      );
    }
  });
});

describe(RangeParseError, () => {
  it("includes structured data", () => {
    try {
      satisfies("2.3", "INVALID");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RangeParseError);
      expect((error as RangeParseError).token).toBe("INVALID");
      expect((error as RangeParseError).reason).toBe(
        "expected format: [operator]version (e.g., '>=2.5' or '2.3')"
      );
      expect((error as RangeParseError).name).toBe("RangeParseError");
    }
  });

  it("has proper message format", () => {
    try {
      satisfies("2.3", "INVALID");
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Invalid range token ('INVALID') — expected format: [operator]version (e.g., '>=2.5' or '2.3')"
      );
    }
  });
});

describe("error type discrimination", () => {
  it("allows distinguishing VersionParseError", () => {
    try {
      satisfies("HELLO", ">=2.0");
      expect.fail("Should have thrown");
    } catch (error) {
      if (error instanceof VersionParseError) {
        expect(error.input).toBe("HELLO");
      } else if (error instanceof RangeParseError) {
        expect.fail("Should be VersionParseError, not RangeParseError");
      } else {
        expect.fail("Should be VersionParseError");
      }
    }
  });

  it("allows distinguishing RangeParseError", () => {
    try {
      satisfies("2.3", "INVALID");
      expect.fail("Should have thrown");
    } catch (error) {
      if (error instanceof VersionParseError) {
        expect.fail("Should be RangeParseError, not VersionParseError");
      } else if (error instanceof RangeParseError) {
        expect(error.token).toBe("INVALID");
      } else {
        expect.fail("Should be RangeParseError");
      }
    }
  });
});

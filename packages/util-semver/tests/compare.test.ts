import {
  compare,
  diff,
  eq,
  gt,
  gte,
  lt,
  lte,
  VersionParseError,
} from "../src/index";

describe(compare, () => {
  it("orders correctly", () => {
    expect(compare("2", "2.0.0")).toBe(0);
    expect(compare("2.3", "2.4")).toBe(-1);
    expect(compare("2.3.1", "2.3.1")).toBe(0);
    expect(compare("2.9", "2.10")).toBe(-1);
    expect(compare("2.11", "2.11.0")).toBe(0);
  });
});

describe("comparison operators", () => {
  describe(eq, () => {
    it("checks equality", () => {
      expect(eq("2", "2.0.0")).toBeTruthy();
      expect(eq("2.5.1", "2.5.1")).toBeTruthy();
      expect(eq("2.5.1", "2.5.0")).toBeFalsy();
    });
  });

  describe(lt, () => {
    it("checks less than", () => {
      expect(lt("2.3", "2.4")).toBeTruthy();
      expect(lt("2.3.0", "2.5.1")).toBeTruthy();
      expect(lt("2.5.1", "2.5.1")).toBeFalsy();
      expect(lt("2.5.1", "2.3.0")).toBeFalsy();
    });
  });

  describe(lte, () => {
    it("checks less than or equal", () => {
      expect(lte("2.3", "2.3")).toBeTruthy();
      expect(lte("2.3.0", "2.5.1")).toBeTruthy();
      expect(lte("2.5.1", "2.5.1")).toBeTruthy();
      expect(lte("2.5.1", "2.3.0")).toBeFalsy();
    });
  });

  describe(gt, () => {
    it("checks greater than", () => {
      expect(gt("2.4", "2.3.9")).toBeTruthy();
      expect(gt("2.5.1", "2.3.0")).toBeTruthy();
      expect(gt("2.5.1", "2.5.1")).toBeFalsy();
      expect(gt("2.3.0", "2.5.1")).toBeFalsy();
    });
  });

  describe(gte, () => {
    it("checks greater than or equal", () => {
      expect(gte("2.3.0", "2.3")).toBeTruthy();
      expect(gte("2.5.1", "2.3.0")).toBeTruthy();
      expect(gte("2.5.1", "2.5.1")).toBeTruthy();
      expect(gte("2.3.0", "2.5.1")).toBeFalsy();
    });
  });
});

describe(diff, () => {
  it("detects major differences", () => {
    expect(diff("2.5.1", "3.0.0")).toBe("major");
    expect(diff("1.0.0", "2.0.0")).toBe("major");
    expect(diff("3.5.1", "2.5.1")).toBe("major");
  });

  it("detects minor differences", () => {
    expect(diff("2.5.1", "2.6.0")).toBe("minor");
    expect(diff("2.5.1", "2.4.9")).toBe("minor");
    expect(diff("1.0.0", "1.1.0")).toBe("minor");
  });

  it("detects patch differences", () => {
    expect(diff("2.5.1", "2.5.2")).toBe("patch");
    expect(diff("2.5.9", "2.5.10")).toBe("patch");
    expect(diff("1.0.0", "1.0.1")).toBe("patch");
  });

  it("returns null for equal versions", () => {
    expect(diff("2.5.1", "2.5.1")).toBeNull();
    expect(diff("2", "2.0.0")).toBeNull();
    expect(diff("2.5", "2.5.0")).toBeNull();
  });

  it("works with partial versions", () => {
    expect(diff("2", "3")).toBe("major");
    expect(diff("2.5", "2.6")).toBe("minor");
  });

  it("throws on invalid version", () => {
    expect(() => diff("HELLO", "2.5.1")).toThrow(VersionParseError);
    expect(() => diff("2.5.1", "WORLD")).toThrow(VersionParseError);
  });
});

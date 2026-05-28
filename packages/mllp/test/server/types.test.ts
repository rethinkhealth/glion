import { matchPattern, parsePattern } from "../../src/server/types.js";

describe("parsePattern", () => {
  it("parses wildcard pattern", () => {
    const result = parsePattern("*");
    expect(result).toEqual({
      messageType: "*",
      source: "*",
      triggerEvent: "*",
    });
  });

  it("parses exact pattern", () => {
    const result = parsePattern("ADT^A01");
    expect(result).toEqual({
      messageType: "ADT",
      source: "ADT^A01",
      triggerEvent: "A01",
    });
  });

  it("parses message type wildcard", () => {
    const result = parsePattern("ADT^*");
    expect(result).toEqual({
      messageType: "ADT",
      source: "ADT^*",
      triggerEvent: "*",
    });
  });

  it("parses trigger event wildcard", () => {
    const result = parsePattern("*^A01");
    expect(result).toEqual({
      messageType: "*",
      source: "*^A01",
      triggerEvent: "A01",
    });
  });

  it("parses message type only (no caret)", () => {
    const result = parsePattern("ADT");
    expect(result).toEqual({
      messageType: "ADT",
      source: "ADT",
      triggerEvent: "*",
    });
  });
});

describe("matchPattern", () => {
  it("matches wildcard against anything", () => {
    const pattern = parsePattern("*");
    expect(matchPattern(pattern, "ADT", "A01")).toBe(true);
    expect(matchPattern(pattern, "ORU", "R01")).toBe(true);
  });

  it("matches exact pattern", () => {
    const pattern = parsePattern("ADT^A01");
    expect(matchPattern(pattern, "ADT", "A01")).toBe(true);
    expect(matchPattern(pattern, "ADT", "A08")).toBe(false);
    expect(matchPattern(pattern, "ORU", "A01")).toBe(false);
  });

  it("matches message type with wildcard trigger", () => {
    const pattern = parsePattern("ADT^*");
    expect(matchPattern(pattern, "ADT", "A01")).toBe(true);
    expect(matchPattern(pattern, "ADT", "A08")).toBe(true);
    expect(matchPattern(pattern, "ORU", "R01")).toBe(false);
  });

  it("matches wildcard message type with specific trigger", () => {
    const pattern = parsePattern("*^A01");
    expect(matchPattern(pattern, "ADT", "A01")).toBe(true);
    expect(matchPattern(pattern, "ORU", "A01")).toBe(true);
    expect(matchPattern(pattern, "ADT", "A08")).toBe(false);
  });

  it("matches message type only pattern against any trigger", () => {
    const pattern = parsePattern("ADT");
    expect(matchPattern(pattern, "ADT", "A01")).toBe(true);
    expect(matchPattern(pattern, "ADT", "A08")).toBe(true);
    expect(matchPattern(pattern, "ORU", "R01")).toBe(false);
  });
});

import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "../src/constants";

describe("DEFAULT_DELIMITERS", () => {
  it("should be defined", () => {
    expect(DEFAULT_DELIMITERS).toBeDefined();
    expect(DEFAULT_DELIMITERS).toStrictEqual({
      component: "^",
      escape: "\\",
      field: "|",
      repetition: "~",
      subcomponent: "&",
    });
  });

  it("should be immutable", () => {
    expect(DEFAULT_DELIMITERS).toBe(DEFAULT_DELIMITERS);
    expect(DEFAULT_DELIMITERS).not.toBe({
      component: "^",
      escape: "\\",
      field: "|",
      repetition: "~",
      subcomponent: "&",
    });
  });
});

describe("SEGMENT_TERMINATOR", () => {
  it("is a carriage return, the segment terminator HL7v2 requires", () => {
    expect(SEGMENT_TERMINATOR).toBe("\r");
  });
});

import { describe, expect, it } from "vitest";

import { TimestampOffsetError, TimestampPrecisionError } from "../src/errors";

describe("TimestampPrecisionError", () => {
  it("states the cause in one sentence", () => {
    const error = new TimestampPrecisionError("minute", "second");
    expect(error.name).toBe("TimestampPrecisionError");
    expect(error.message).toBe(
      "The value does not give a field its precision includes; a DT, TM, or DTM gives every field from its first down to its precision."
    );
  });
});

describe("TimestampOffsetError", () => {
  it("states the cause in one sentence", () => {
    const error = new TimestampOffsetError("GMT-00:44:30");
    expect(error.name).toBe("TimestampOffsetError");
    expect(error.message).toBe(
      "The time zone's offset from UTC at this moment is not in whole minutes; HL7v2 writes an offset as `+/-HHMM`."
    );
  });
});

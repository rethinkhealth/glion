import { describe, expect, it } from "vitest";

import { MllpServerError, MllpServerErrorCode } from "../src/errors";

describe("MllpServerError", () => {
  it("states that a middleware called next() a second time", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.NEXT_CALLED_TWICE).message
    ).toBe(
      "A middleware called `next()` a second time; a middleware calls `next()` at most once."
    );
  });

  it("states that the byte stream is not framed as MLLP requires", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION).message
    ).toBe(
      "The MLLP byte stream is not framed as MLLP requires, and the connection is closing; the error's cause says how."
    );
  });

  it("keeps its code, its name, and the cause it is given", () => {
    const cause = new Error("codec");
    const error = new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, {
      cause,
    });
    expect(error.code).toBe("PROTOCOL_VIOLATION");
    expect(error.name).toBe("MllpServerError");
    expect(error.cause).toBe(cause);
  });
});

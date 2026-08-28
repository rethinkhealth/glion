import { describe, expect, it } from "vitest";

import { AckCode, isAckNakCode } from "../src/constants";

describe("isAckNakCode", () => {
  it("is true for every Table 0008 reject code", () => {
    expect(isAckNakCode(AckCode.ApplicationError)).toBe(true);
    expect(isAckNakCode(AckCode.ApplicationReject)).toBe(true);
    expect(isAckNakCode(AckCode.CommitError)).toBe(true);
    expect(isAckNakCode(AckCode.CommitReject)).toBe(true);
  });

  it("is false for accept codes", () => {
    expect(isAckNakCode(AckCode.ApplicationAccept)).toBe(false);
    expect(isAckNakCode(AckCode.CommitAccept)).toBe(false);
  });

  it("is false for arbitrary strings", () => {
    expect(isAckNakCode("")).toBe(false);
    expect(isAckNakCode("XX")).toBe(false);
    expect(isAckNakCode("ae")).toBe(false);
  });
});

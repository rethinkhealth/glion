import { describe, expect, it } from "vitest";

import { AckCode } from "../src/constants";
import { isAckCode, isAckNakCode, isAckSuccessCode } from "../src/helper";

describe("isAckCode", () => {
  it("is true for every Table 0008 code", () => {
    for (const code of Object.values(AckCode)) {
      expect(isAckCode(code)).toBe(true);
    }
  });

  it("is false for arbitrary strings", () => {
    expect(isAckCode("")).toBe(false);
    expect(isAckCode("XX")).toBe(false);
    expect(isAckCode("aa")).toBe(false);
  });
});

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

describe("isAckSuccessCode", () => {
  it.each([AckCode.ApplicationAccept, AckCode.CommitAccept])(
    "accepts %s",
    (code) => {
      expect(isAckSuccessCode(code)).toBe(true);
    }
  );

  it.each([
    AckCode.ApplicationError,
    AckCode.ApplicationReject,
    AckCode.CommitError,
    AckCode.CommitReject,
  ])("rejects the NAK code %s", (code) => {
    expect(isAckSuccessCode(code)).toBe(false);
  });

  it.each(["", "OK", "aa"])(
    "rejects %o, which is not a code at all",
    (value) => {
      expect(isAckSuccessCode(value)).toBe(false);
    }
  );

  it("partitions Table 0008 with isAckNakCode", () => {
    for (const code of Object.values(AckCode)) {
      expect(isAckSuccessCode(code)).toBe(!isAckNakCode(code));
    }
  });
});

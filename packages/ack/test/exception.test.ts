import { describe, expect, it } from "vitest";

import { AckCode } from "../src/constants";
import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
  ackExceptionFor,
} from "../src/exception";

describe("ackExceptionFor", () => {
  it("maps each Table 0008 reject code to its exception class", () => {
    expect(ackExceptionFor(AckCode.ApplicationError, {})).toBeInstanceOf(
      AckApplicationError
    );
    expect(ackExceptionFor(AckCode.ApplicationReject, {})).toBeInstanceOf(
      AckApplicationReject
    );
    expect(ackExceptionFor(AckCode.CommitError, {})).toBeInstanceOf(
      AckCommitError
    );
    expect(ackExceptionFor(AckCode.CommitReject, {})).toBeInstanceOf(
      AckCommitReject
    );
  });

  it("carries the supplied ACK fields and a standard message", () => {
    const exc = ackExceptionFor(AckCode.ApplicationError, {
      controlId: "MSG001",
      errorCode: "207",
      raw: "MSH|^~\\&|...",
      severity: "E",
    });
    expect(exc).toBeInstanceOf(AckException);
    expect(exc.code).toBe(AckCode.ApplicationError);
    expect(exc.controlId).toBe("MSG001");
    expect(exc.errorCode).toBe("207");
    expect(exc.severity).toBe("E");
    expect(exc.raw).toBe("MSH|^~\\&|...");
    expect(exc.message).toContain("AE");
  });
});

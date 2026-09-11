import { describe, expect, it } from "vitest";

import { AckCode, Hl7ErrorCode, Severity } from "../../src/constants";
import { CommitInternalError } from "../../src/errors/commit-internal-error";
import { AckCommitError, AckException } from "../../src/exception";

describe("CommitInternalError", () => {
  it("has pre-baked error code 207, severity E, and commit-level code CE", () => {
    const error = new CommitInternalError("Storage failure");
    expect(error.code).toBe(AckCode.CommitError);
    expect(error.errorCode).toBe(Hl7ErrorCode.ApplicationInternalError);
    expect(error.severity).toBe(Severity.Error);
    expect(error.message).toBe("Storage failure");
    expect(error.name).toBe("CommitInternalError");
  });

  it("is instanceof the full hierarchy", () => {
    const error = new CommitInternalError("fail");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckCommitError);
    expect(error).toBeInstanceOf(CommitInternalError);
  });

  it("preserves the cause when provided", () => {
    const cause = new Error("disk full");
    const error = new CommitInternalError("wrapped", cause);
    expect(error.cause).toBe(cause);
  });

  it("carries the data an implementation needs for its own ERR segment", () => {
    const error = new CommitInternalError("fail");
    expect(error.errorCode).toBe("207");
    expect(error.severity).toBe(Severity.Error);
  });
});

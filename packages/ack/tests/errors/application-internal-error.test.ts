import { describe, expect, it } from "vitest";

import { AckCode, Hl7ErrorCode, Severity } from "../../src/constants";
import { ApplicationInternalError } from "../../src/errors/application-internal-error";
import { AckApplicationError, AckException } from "../../src/exception";

describe("ApplicationInternalError", () => {
  it("has pre-baked error code 207 and severity E", () => {
    const error = new ApplicationInternalError("Something broke");
    expect(error.code).toBe(AckCode.ApplicationError);
    expect(error.errorCode).toBe(Hl7ErrorCode.ApplicationInternalError);
    expect(error.severity).toBe(Severity.Error);
    expect(error.message).toBe("Something broke");
    expect(error.name).toBe("ApplicationInternalError");
  });

  it("is instanceof the full hierarchy", () => {
    const error = new ApplicationInternalError("fail");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckApplicationError);
    expect(error).toBeInstanceOf(ApplicationInternalError);
  });

  it("preserves the cause when provided", () => {
    const cause = new Error("root cause");
    const error = new ApplicationInternalError("wrapped", cause);
    expect(error.cause).toBe(cause);
  });

  it("works without a cause", () => {
    const error = new ApplicationInternalError("no cause");
    expect(error.cause).toBeUndefined();
  });

  it("carries the data an implementation needs for its own ERR segment", () => {
    const error = new ApplicationInternalError("fail");
    expect(error.errorCode).toBe("207");
    expect(error.severity).toBe(Severity.Error);
  });
});

import { toHl7v2 } from "@glion/to-hl7v2";
import { describe, expect, it } from "vitest";

import { AckCode, Hl7ErrorCode, Severity } from "../src/constants";
import { ApplicationInternalError } from "../src/errors/application-internal-error";
import { CommitInternalError } from "../src/errors/commit-internal-error";
import { UnsupportedMessageTypeReject } from "../src/errors/unsupported-message-type-reject";
import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckException,
} from "../src/exception";

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

  it("builds the correct ERR segment", () => {
    const error = new ApplicationInternalError("fail");
    expect(toHl7v2(error.toErrSegment())).toBe("ERR|||207|E");
  });
});

describe("UnsupportedMessageTypeReject", () => {
  it("has pre-baked error code 200 and severity E", () => {
    const error = new UnsupportedMessageTypeReject("ADT^A01 not handled");
    expect(error.code).toBe(AckCode.ApplicationReject);
    expect(error.errorCode).toBe(Hl7ErrorCode.UnsupportedMessageType);
    expect(error.severity).toBe(Severity.Error);
    expect(error.message).toBe("ADT^A01 not handled");
    expect(error.name).toBe("UnsupportedMessageTypeReject");
  });

  it("is instanceof the full hierarchy", () => {
    const error = new UnsupportedMessageTypeReject("not supported");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckApplicationReject);
    expect(error).toBeInstanceOf(UnsupportedMessageTypeReject);
  });

  it("takes only a message — no options needed", () => {
    const error = new UnsupportedMessageTypeReject("simple");
    expect(error.errorCode).toBe(Hl7ErrorCode.UnsupportedMessageType);
    expect(error.severity).toBe(Severity.Error);
  });

  it("builds the correct ERR segment", () => {
    const error = new UnsupportedMessageTypeReject("fail");
    expect(toHl7v2(error.toErrSegment())).toBe("ERR|||200|E");
  });
});

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

  it("builds the correct ERR segment", () => {
    const error = new CommitInternalError("fail");
    expect(toHl7v2(error.toErrSegment())).toBe("ERR|||207|E");
  });
});

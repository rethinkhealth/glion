import { describe, expect, it } from "vitest";

import { AckCode, Hl7ErrorCode, Severity } from "../../src/constants";
import { UnsupportedMessageTypeReject } from "../../src/errors/unsupported-message-type-reject";
import { AckApplicationReject, AckException } from "../../src/exception";

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

  it("carries the data an implementation needs for its own ERR segment", () => {
    const error = new UnsupportedMessageTypeReject("fail");
    expect(error.errorCode).toBe("200");
    expect(error.severity).toBe(Severity.Error);
  });
});

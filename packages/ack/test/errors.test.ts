import { toHl7v2 } from "@glion/to-hl7v2";
import { describe, expect, it } from "vitest";

import { AckCode, Hl7ErrorCode, Severity } from "../src/constants";
import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
} from "../src/exception";

describe("AckException", () => {
  it("is the base class for all ACK exceptions", () => {
    const error = new AckApplicationError("test", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    const reject = new AckApplicationReject("test", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error).toBeInstanceOf(AckException);
    expect(reject).toBeInstanceOf(AckException);
  });

  it("allows a single instanceof check for any ACK error", () => {
    const errors: unknown[] = [
      new AckApplicationError("err", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
      }),
      new AckApplicationReject("rej", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
      }),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(AckException);
    }
  });

  it("preserves controlId when provided", () => {
    const subclasses = [
      AckApplicationError,
      AckApplicationReject,
      AckCommitError,
      AckCommitReject,
    ];
    for (const Subclass of subclasses) {
      const error = new Subclass("test", {
        controlId: "MSG001",
        errorCode: Hl7ErrorCode.ApplicationInternalError,
      });
      expect(error.controlId).toBe("MSG001");
    }
  });

  it("controlId defaults to undefined when omitted", () => {
    const error = new AckApplicationError("test", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error.controlId).toBeUndefined();
  });
});

describe("AckApplicationError", () => {
  it("creates an AE error with required errorCode", () => {
    const error = new AckApplicationError("Something went wrong", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckApplicationError);
    expect(error.message).toBe("Something went wrong");
    expect(error.code).toBe(AckCode.ApplicationError);
    expect(error.errorCode).toBe(Hl7ErrorCode.ApplicationInternalError);
    expect(error.severity).toBeUndefined();
    expect(error.name).toBe("AckApplicationError");
  });

  it("creates an AE error with severity", () => {
    const error = new AckApplicationError("Validation failed", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
    });
    expect(error.code).toBe(AckCode.ApplicationError);
    expect(error.message).toBe("Validation failed");
    expect(error.errorCode).toBe(Hl7ErrorCode.ApplicationInternalError);
    expect(error.severity).toBe(Severity.Error);
  });

  it("has the correct name property", () => {
    const error = new AckApplicationError("test", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error.name).toBe("AckApplicationError");
  });

  it("preserves the cause when provided", () => {
    const cause = new Error("root cause");
    const error = new AckApplicationError("Something went wrong", {
      cause,
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error.cause).toBe(cause);
  });

  it("has a stack trace", () => {
    const error = new AckApplicationError("test", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AckApplicationError");
  });
});

describe("AckApplicationReject", () => {
  it("creates an AR error with required errorCode", () => {
    const error = new AckApplicationReject("Rejected", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckApplicationReject);
    expect(error.message).toBe("Rejected");
    expect(error.code).toBe(AckCode.ApplicationReject);
    expect(error.errorCode).toBe(Hl7ErrorCode.UnsupportedMessageType);
    expect(error.name).toBe("AckApplicationReject");
  });

  it("creates an AR error with severity", () => {
    const error = new AckApplicationReject("Unsupported", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
      severity: Severity.Error,
    });
    expect(error.code).toBe(AckCode.ApplicationReject);
    expect(error.errorCode).toBe(Hl7ErrorCode.UnsupportedMessageType);
    expect(error.severity).toBe(Severity.Error);
    expect(error.message).toBe("Unsupported");
  });

  it("has the correct name property", () => {
    const error = new AckApplicationReject("test", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error.name).toBe("AckApplicationReject");
  });

  it("preserves the cause when provided", () => {
    const cause = new TypeError("invalid input");
    const error = new AckApplicationReject("Rejected", {
      cause,
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error.cause).toBe(cause);
  });

  it("has a stack trace", () => {
    const error = new AckApplicationReject("test", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AckApplicationReject");
  });
});

describe("AckCommitError", () => {
  it("creates a CE error with required errorCode", () => {
    const error = new AckCommitError("Commit failed", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckCommitError);
    expect(error.message).toBe("Commit failed");
    expect(error.code).toBe(AckCode.CommitError);
    expect(error.errorCode).toBe(Hl7ErrorCode.ApplicationInternalError);
    expect(error.severity).toBeUndefined();
    expect(error.name).toBe("AckCommitError");
  });

  it("creates a CE error with severity", () => {
    const error = new AckCommitError("Storage failure", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
    });
    expect(error.code).toBe(AckCode.CommitError);
    expect(error.severity).toBe(Severity.Error);
  });

  it("preserves the cause when provided", () => {
    const cause = new Error("disk full");
    const error = new AckCommitError("fail", {
      cause,
      errorCode: Hl7ErrorCode.ApplicationInternalError,
    });
    expect(error.cause).toBe(cause);
  });
});

describe("AckCommitReject", () => {
  it("creates a CR error with required errorCode", () => {
    const error = new AckCommitReject("Commit rejected", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AckException);
    expect(error).toBeInstanceOf(AckCommitReject);
    expect(error.message).toBe("Commit rejected");
    expect(error.code).toBe(AckCode.CommitReject);
    expect(error.errorCode).toBe(Hl7ErrorCode.UnsupportedMessageType);
    expect(error.severity).toBeUndefined();
    expect(error.name).toBe("AckCommitReject");
  });

  it("creates a CR error with severity", () => {
    const error = new AckCommitReject("Not accepted", {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
      severity: Severity.Error,
    });
    expect(error.code).toBe(AckCode.CommitReject);
    expect(error.severity).toBe(Severity.Error);
  });

  it("preserves the cause when provided", () => {
    const cause = new TypeError("invalid");
    const error = new AckCommitReject("fail", {
      cause,
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
    });
    expect(error.cause).toBe(cause);
  });
});

describe("instanceof grouping", () => {
  it("all four subclasses are instanceof AckException", () => {
    const errors: unknown[] = [
      new AckApplicationError("e", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
      }),
      new AckApplicationReject("r", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
      }),
      new AckCommitError("ce", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
      }),
      new AckCommitReject("cr", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
      }),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(AckException);
    }
  });
});

describe("toErrSegment", () => {
  it("builds an ERR segment with error code and explicit severity", () => {
    const error = new AckApplicationError("fail", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
    });

    const segment = error.toErrSegment();
    const raw = toHl7v2(segment);

    expect(raw).toBe("ERR|||207|E");
  });

  it("defaults severity to Error when omitted", () => {
    const error = new AckApplicationError("fail", {
      errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
    });

    const segment = error.toErrSegment();
    const raw = toHl7v2(segment);

    expect(raw).toBe("ERR|||204|E");
  });

  it("uses Warning severity when specified", () => {
    const error = new AckApplicationError("warn", {
      errorCode: Hl7ErrorCode.TableValueNotFound,
      severity: Severity.Warning,
    });

    const segment = error.toErrSegment();
    const raw = toHl7v2(segment);

    expect(raw).toBe("ERR|||103|W");
  });

  it("works for all exception subclasses", () => {
    const cases = [
      new AckApplicationError("e", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
        severity: Severity.Error,
      }),
      new AckApplicationReject("r", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
      }),
      new AckCommitError("ce", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
        severity: Severity.Error,
      }),
      new AckCommitReject("cr", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
      }),
    ];

    for (const error of cases) {
      const segment = error.toErrSegment();
      expect(segment.name).toBe("ERR");
    }
  });
});

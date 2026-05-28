// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable no-empty-function
// oxlint-disable no-throw-literal
import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  AckCommitError,
  AckCommitReject,
  Hl7ErrorCode,
  Severity,
  UnsupportedMessageTypeReject,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { ConnectionInfo } from "@glion/mllp";

import { ackMiddleware } from "../src/ack";

const SAMPLE_ADT = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const MOCK_CONNECTION: ConnectionInfo = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
  state: new Map(),
};

function toBytes(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

describe("ack middleware", () => {
  describe("AA (success)", () => {
    it("sends AA when handler completes without error or response", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {
        // no return, no throw — success
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AA|MSG001");
      expect(response!.raw).toContain("|RecvApp|RecvFac|");
      expect(response!.raw).toContain("|ACK^A01|");
    });

    it("sends AA when handler returns undefined", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {});

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AA|MSG001");
    });

    it("derives sending from original message when sending is omitted", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {});

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      // MSH-3/4 should be RecvApp/RecvFac (from original MSH-5/6)
      expect(response!.raw).toContain("|RecvApp|RecvFac|");
      expect(response!.raw).toContain("MSA|AA|MSG001");
    });
  });

  describe("AE (error)", () => {
    it("sends AE when handler throws AckApplicationError", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckApplicationError("Validation failed", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001|Validation failed");
      expect(response!.raw).toContain("ERR|");
      expect(response!.raw).toContain("|207|E");
    });

    it("sends AE with UnknownKeyIdentifier error code", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckApplicationError("Patient 12345 not found", {
          errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001");
      expect(response!.raw).toContain("|204|E");
    });
  });

  describe("AR (reject)", () => {
    it("sends AR when handler throws AckApplicationReject", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckApplicationReject("Not supported", {
          errorCode: Hl7ErrorCode.UnsupportedMessageType,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AR|MSG001|Not supported");
      expect(response!.raw).toContain("ERR|");
    });

    it("sends AR when handler throws UnsupportedMessageTypeReject", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new UnsupportedMessageTypeReject("ADT^A01 not handled");
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AR|MSG001");
      expect(response!.raw).toContain("|200|E");
    });
  });

  describe("unknown errors", () => {
    it("wraps unknown Error as ApplicationInternalError and sends AE", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new Error("Database connection failed");
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001");
      expect(response!.raw).toContain("|207|E");
    });

    it("wraps non-Error throws as ApplicationInternalError", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw "string error";
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001");
    });
  });

  describe("passthrough", () => {
    it("does not override existing response when no error is thrown", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => ({
        raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001|Custom",
      }));

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toBe(
        "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001|Custom"
      );
    });

    it("overrides existing response when handler throws an error", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      // Middleware sets ctx.res before next(), but handler throws
      app.use(async (ctx, next) => {
        ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001|Stale" };
        await next();
      });
      app.on("ADT^A01", () => {
        throw new AckApplicationError("Validation failed", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001|Validation failed");
      expect(response!.raw).not.toContain("Stale");
    });
  });

  describe("generateId", () => {
    it("uses custom ID generator for MSH-10 when provided", async () => {
      let counter = 0;
      const app = new Mllp().parser(parseHL7v2);
      app.use(
        ackMiddleware({
          generateId: () => `CUSTOM-${String(++counter).padStart(3, "0")}`,
        })
      );
      app.on("ADT^A01", () => {});

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("|CUSTOM-001|");
    });

    it("calls generateId on each request", async () => {
      let counter = 0;
      const app = new Mllp().parser(parseHL7v2);
      app.use(
        ackMiddleware({
          generateId: () => `ID-${String(++counter).padStart(3, "0")}`,
        })
      );
      app.on("ADT^A01", () => {});

      const res1 = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );
      const res2 = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(res1!.raw).toContain("|ID-001|");
      expect(res2!.raw).toContain("|ID-002|");
    });
  });

  describe("CA (commit accept)", () => {
    it("sends CA when successCode is CA and handler completes without error", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ successCode: AckCode.CommitAccept }));
      app.on("ADT^A01", () => {});

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|CA|MSG001");
    });
  });

  describe("CE (commit error)", () => {
    it("sends CE when handler throws AckCommitError", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckCommitError("Commit failed", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|CE|MSG001|Commit failed");
      expect(response!.raw).toContain("ERR|");
      expect(response!.raw).toContain("|207|E");
    });
  });

  describe("CR (commit reject)", () => {
    it("sends CR when handler throws AckCommitReject", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckCommitReject("Rejected at commit", {
          errorCode: Hl7ErrorCode.UnsupportedMessageType,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|CR|MSG001|Rejected at commit");
      expect(response!.raw).toContain("ERR|");
      expect(response!.raw).toContain("|200|E");
    });
  });

  describe("unknown errors default to ApplicationInternalError", () => {
    it("wraps unknown Error as AE (application error), not CE", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ successCode: AckCode.CommitAccept }));
      app.on("ADT^A01", () => {
        throw new Error("Something broke");
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      expect(response!.raw).toContain("MSA|AE|MSG001");
      expect(response!.raw).toContain("|207|E");
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/506
  describe("escape encoding", () => {
    it("encodes delimiter characters in error messages", async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.on("ADT^A01", () => {
        throw new AckApplicationError("Value contains | delimiter", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });

      const response = await app.handle(
        SAMPLE_ADT,
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );

      expect(response).toBeDefined();
      // The pipe in the error message must be encoded as \F\
      expect(response!.raw).toContain("Value contains \\F\\ delimiter");
      // It must NOT contain the raw pipe in the MSA text field
      expect(response!.raw).not.toContain("Value contains | delimiter");
    });
  });

  describe("middleware ordering", () => {
    it("works with other middleware in the chain", async () => {
      const app = new Mllp().parser(parseHL7v2);
      const order: string[] = [];

      app.use(ackMiddleware({ sending: { application: "S", facility: "F" } }));
      app.use(async (_ctx, next) => {
        order.push("before");
        await next();
        order.push("after");
      });
      app.on("ADT^A01", () => {
        order.push("handler");
      });

      await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);

      expect(order).toEqual(["before", "handler", "after"]);
    });
  });
});

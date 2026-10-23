// oxlint-disable require-await
import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  Hl7ErrorCode,
} from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import type { Plugin } from "unified";

import { MllpServerError } from "../../src/errors";
import { Mllp } from "../../src/server/mllp";
import type { ConnectionInfo, Middleware } from "../../src/server/types";

/** A unified parser plugin whose parse step throws `error`. */
function throwingParser(error: Error): Plugin<[], string, Root> {
  return function parser() {
    this.parser = () => {
      throw error;
    };
  };
}

const SAMPLE_ADT = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SAMPLE_ORU = [
  "MSH|^~\\&|Lab|Fac|App|Fac|20240101||ORU^R01|MSG002|P|2.5.1",
  "PID|1||99999",
  "OBR|1||LAB123|CBC",
].join("\r");

const SAMPLE_ADT_V23 = [
  "MSH|^~\\&|OldApp|OldFac|RecvApp|RecvFac|20240101120000||ADT^A01|MSG005|P|2.3",
  "PID|1||67890",
].join("\r");

const MOCK_CONNECTION: ConnectionInfo = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
  state: new Map(),
};

const RESPONSE_OK = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };
const RESPONSE_REJECT = {
  raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AR|MSG002|Unsupported",
};

function toBytes(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

function createApp() {
  return new Mllp().parser(parseHL7v2);
}

describe("Mllp", () => {
  it("creates a server instance with no args", () => {
    const app = new Mllp();
    expect(app).toBeInstanceOf(Mllp);
  });

  it("supports fluent chaining including parser()", () => {
    const app = new Mllp();
    const result = app
      .parser(parseHL7v2)
      .use(async (_ctx, next) => next())
      .on("*", async () => RESPONSE_OK);
    expect(result).toBe(app);
  });

  describe("parser() lifecycle stage", () => {
    it("throws MllpServerError when handle() called without parser", async () => {
      const app = new Mllp();
      app.on("*", async () => RESPONSE_OK);

      await expect(
        app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION)
      ).rejects.toThrow(MllpServerError);

      await expect(
        app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION)
      ).rejects.toThrow("No parser registered");
    });

    it("missing-parser error has NO_PARSER code", async () => {
      const app = new Mllp();
      try {
        await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpServerError);
        expect((error as MllpServerError).code).toBe("NO_PARSER");
      }
    });

    it("last-write-wins when parser() called multiple times", async () => {
      // Create a second distinct processor so we can tell them apart
      const second = unified().use(hl7v2Parser).freeze();
      const firstSpy = vi.spyOn(parseHL7v2, "parse");
      const secondSpy = vi.spyOn(second, "parse");

      const app = new Mllp().parser(parseHL7v2).parser(second);
      app.on("*", async () => RESPONSE_OK);

      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(firstSpy).not.toHaveBeenCalled();
      expect(secondSpy).toHaveBeenCalledOnce();

      firstSpy.mockRestore();
      secondSpy.mockRestore();
    });

    it("ctx.ast is always available synchronously", async () => {
      const app = createApp();
      let astType = "";
      let childrenCount = 0;

      app.on("ADT^A01", (ctx) => {
        astType = ctx.ast.type;
        childrenCount = ctx.ast.children.length;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(astType).toBe("root");
      expect(childrenCount).toBeGreaterThan(0);
    });

    it("ctx.tree() returns the transformed tree lazily", async () => {
      const app = createApp();
      let treeType = "";

      app.on("ADT^A01", async (ctx) => {
        const tree = await ctx.tree();
        treeType = tree.type;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(treeType).toBe("root");
    });

    it("populates ctx.file with VFile", async () => {
      const app = createApp();
      let fileExists = false;

      app.on("ADT^A01", async (ctx) => {
        fileExists = ctx.file !== undefined;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(fileExists).toBe(true);
    });

    it("populates ctx.result when processor has a compiler", async () => {
      const app = createApp(); // parseHL7v2 includes hl7v2Jsonify
      let resultExists = false;

      app.on("ADT^A01", async (ctx) => {
        resultExists = (await ctx.result()) !== undefined;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(resultExists).toBe(true);
    });
  });

  it("routes ADT^A01 to correct handler", async () => {
    const app = createApp();
    app.on("ADT^A01", async () => RESPONSE_OK);
    app.on("*", async () => RESPONSE_REJECT);

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response).toEqual(RESPONSE_OK);
  });

  it("routes to catch-all when no specific match", async () => {
    const app = createApp();
    app.on("ADT^A01", async () => RESPONSE_OK);
    app.on("*", async () => RESPONSE_REJECT);

    const response = await app.handle(toBytes(SAMPLE_ORU), MOCK_CONNECTION);
    expect(response).toEqual(RESPONSE_REJECT);
  });

  it("replies AR when no handler matches - no router", async () => {
    const app = createApp();
    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw).toContain("\rMSA|AR|");
  });

  it("replies AR when no handler matches - with a non-matching route", async () => {
    const app = createApp();

    app.on("ORU^O12", async () => RESPONSE_OK);

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw).toContain("\rMSA|AR|");
  });

  it("executes middleware before handler", async () => {
    const app = createApp();
    let middlewareRan = false;
    let handlerSawEnriched = false;

    app.use(async (ctx, next) => {
      middlewareRan = true;
      ctx.set("enriched", true);
      await next();
    });
    app.on("ADT^A01", async (ctx) => {
      handlerSawEnriched = ctx.get("enriched") === true;
      return RESPONSE_OK;
    });

    await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(middlewareRan).toBe(true);
    expect(handlerSawEnriched).toBe(true);
  });

  it("executes scoped middleware only for matching messages", async () => {
    const app = createApp();
    const adtMiddlewareRan = { value: false };

    app.use("ADT^*", async (_ctx, next) => {
      adtMiddlewareRan.value = true;
      await next();
    });
    app.on("*", async () => RESPONSE_OK);

    await app.handle(toBytes(SAMPLE_ORU), MOCK_CONNECTION);
    expect(adtMiddlewareRan.value).toBe(false);

    await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(adtMiddlewareRan.value).toBe(true);

    adtMiddlewareRan.value = false;
    await app.handle(toBytes(SAMPLE_ORU), MOCK_CONNECTION);
    expect(adtMiddlewareRan.value).toBe(false);
  });

  it("middleware can short-circuit with response", async () => {
    const app = createApp();
    const handlerRan = { value: false };

    app.use(async () => ({
      raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AR|MSG001|Blocked by middleware",
    }));
    app.on("*", async () => {
      handlerRan.value = true;
      return RESPONSE_OK;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw).toContain("Blocked by middleware");
    expect(handlerRan.value).toBe(false);
  });

  describe("filter function routing", () => {
    it("routes with filter on messageType", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");
    });

    it("filter rejects non-matching messages", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ORU), MOCK_CONNECTION);
      expect(response?.raw).toContain("\rMSA|AR|");
    });

    it("filter can inspect triggerEvent", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT" && ctx.triggerEvent === "A01",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");
    });

    it("filter can inspect version", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.version === "2.3",
        async () => RESPONSE_OK
      );

      const v23Response = await app.handle(
        toBytes(SAMPLE_ADT_V23),
        MOCK_CONNECTION
      );
      expect(v23Response?.raw).toContain("MSA|AA");

      const v251Response = await app.handle(
        toBytes(SAMPLE_ADT),
        MOCK_CONNECTION
      );
      expect(v251Response?.raw).toContain("\rMSA|AR|");
    });

    it("filter can inspect controlId", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.controlId === "MSG001",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");

      const noMatch = await app.handle(toBytes(SAMPLE_ORU), MOCK_CONNECTION);
      expect(noMatch?.raw).toContain("\rMSA|AR|");
    });

    it("filter can inspect connection metadata", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.connection.remoteAddress === "127.0.0.1",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");
    });

    it("string pattern wins over filter when registered first", async () => {
      const app = createApp();
      app.on("ADT^A01", async () => RESPONSE_OK);
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async () => RESPONSE_REJECT
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");
    });

    it("filter wins over string pattern when registered first", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async () => RESPONSE_OK
      );
      app.on("ADT^A01", async () => RESPONSE_REJECT);

      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");
    });

    it("scoped middleware with filter function", async () => {
      const app = createApp();
      const middlewareRan = { value: false };

      app.use(
        (ctx) => ctx.version === "2.3",
        async (_ctx, next) => {
          middlewareRan.value = true;
          await next();
        }
      );
      app.on("*", async () => RESPONSE_OK);

      await app.handle(toBytes(SAMPLE_ADT_V23), MOCK_CONNECTION);
      expect(middlewareRan.value).toBe(true);

      middlewareRan.value = false;
      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(middlewareRan.value).toBe(false);
    });

    it("filter with ast inspection", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.ast.children.length > 2,
        async () => RESPONSE_OK
      );

      // SAMPLE_ADT has 3 segments (MSH, EVN, PID)
      const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
      expect(response?.raw).toContain("MSA|AA");

      // SAMPLE_ADT_V23 has 2 segments (MSH, PID) — should not match
      const noMatch = await app.handle(
        toBytes(SAMPLE_ADT_V23),
        MOCK_CONNECTION
      );
      expect(noMatch?.raw).toContain("\rMSA|AR|");
    });
  });
});

/** A middleware that records `ctx.error` and the reply's MSA after `next()`. */
function observe(seen: { error?: Error; msa?: string }): Middleware {
  return async (ctx, next) => {
    await next();
    seen.error = ctx.error;
    seen.msa = ctx.res?.raw.split("\r")[1];
  };
}

const SAMPLE_ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

describe("acknowledgment defaults", () => {
  it("replies AA when the route handler returns nothing", async () => {
    const app = createApp();
    app.on("ADT^A01", () => {
      // processed, nothing to return
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    const [msh, msa] = response?.raw.split("\r") ?? [];
    expect(msh).toMatch(
      /^MSH\|\^~\\&\|RecvApp\|RecvFac\|SendApp\|SendFac\|\d{14}\|\|ACK\^A01\^ACK\|/
    );
    expect(msa).toBe("MSA|AA|MSG001");
  });

  it("replies with ctx.ack() and the code it is given", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|CA|MSG001");
  });

  it("keeps a reply the route handler set on ctx.res", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => {
      ctx.res = RESPONSE_REJECT;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response).toBe(RESPONSE_REJECT);
  });

  it("replies AA when a middleware set ctx.res before next() and the route handler returns nothing", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      ctx.res = RESPONSE_REJECT;
      await next();
    });
    app.on("ADT^A01", () => {
      // processed, nothing to return
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|AA|MSG001");
  });

  it("replies with the code and text of a thrown AckException, never its message", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new AckApplicationError("Lookup of MRN 12345 failed", {
      errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
      text: "Patient not on file",
    });
    app.use(observe(seen));
    app.on("ADT^A01", () => {
      throw thrown;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE|MSG001|Patient not on file"
    );
    expect(response?.raw).not.toContain("12345");
    expect(seen.error).toBe(thrown);
  });

  it("omits MSA-3 for a thrown AckException without text", async () => {
    const app = createApp();
    app.on("ADT^A01", () => {
      throw new AckApplicationReject("Rejected", {});
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|AR|MSG001");
  });

  it("replies AE with MSA-3 Application internal error to any other throw, never its message", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    app.use(observe(seen));
    app.on("ADT^A01", () => {
      throw thrown;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE|MSG001|Application internal error"
    );
    expect(response?.raw).not.toContain("ECONNREFUSED");
    expect(seen).toEqual({
      error: thrown,
      msa: "MSA|AE|MSG001|Application internal error",
    });
  });

  it("replies AE without running the route handler when a middleware throws before next()", async () => {
    const app = createApp();
    const ran: string[] = [];
    app.use(() => {
      throw new Error("unauthorized");
    });
    app.on("ADT^A01", () => {
      ran.push("handler");
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE|MSG001|Application internal error"
    );
    expect(ran).toEqual([]);
  });

  it("lets a middleware replace the reply to an error after next()", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      await next();
      if (ctx.error) {
        ctx.res = ctx.ack({
          code: AckCode.ApplicationError,
          text: "Try again later",
        });
      }
    });
    app.on("ADT^A01", () => {
      throw new Error("database unavailable");
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|AE|MSG001|Try again later");
  });

  it("keeps the reply when a middleware throws after the route handler replied", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new Error("audit write failed");
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      throw thrown;
    });
    app.on("ADT^A01", () => {
      // processed, nothing to return
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|AA|MSG001");
    expect(seen).toEqual({ error: thrown, msa: "MSA|AA|MSG001" });
  });

  it("keeps a middleware's rewrite of the reply when a middleware outside it throws", async () => {
    const app = createApp();
    app.use(async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    });
    app.use(async (ctx, next) => {
      await next();
      ctx.res = ctx.ack({ code: AckCode.CommitAccept });
    });
    app.on("ADT^A01", () => {
      // processed, nothing to return
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe("MSA|CA|MSG001");
  });

  it("keeps the first error in ctx.error and the route handler's NAK when a middleware throws after it", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const first = new AckApplicationReject("Rejected", { text: "Bad order" });
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    });
    app.on("ADT^A01", () => {
      throw first;
    });

    await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(seen).toEqual({ error: first, msa: "MSA|AR|MSG001|Bad order" });
  });

  it("sends no reply when a middleware returns without calling next()", async () => {
    const app = createApp();
    app.use(() => {
      // dropped
    });
    app.on("ADT^A01", () => RESPONSE_OK);

    expect(
      await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION)
    ).toBeUndefined();
  });

  it("replies AR with MSA-3 Unsupported message type when no route matches", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ORU^R01", () => RESPONSE_OK);

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AR|MSG001|Unsupported message type"
    );
    expect(seen.error).toBeInstanceOf(AckApplicationReject);
    expect((seen.error as AckApplicationReject).errorCode).toBe(
      Hl7ErrorCode.UnsupportedMessageType
    );
  });

  it("sends no reply to an ACK no route matches", async () => {
    const app = createApp();

    expect(
      await app.handle(toBytes(SAMPLE_ACK), MOCK_CONNECTION)
    ).toBeUndefined();
  });

  it("sends no reply to an ACK whose route handler returns nothing", async () => {
    const app = createApp();
    app.on("*", () => {
      // processed, nothing to return
    });

    expect(
      await app.handle(toBytes(SAMPLE_ACK), MOCK_CONNECTION)
    ).toBeUndefined();
  });

  it("sends no reply to an ACK whose route handler throws", async () => {
    const app = createApp();
    app.on("*", () => {
      throw new Error("crash");
    });

    expect(
      await app.handle(toBytes(SAMPLE_ACK), MOCK_CONNECTION)
    ).toBeUndefined();
  });

  it("replies to an ACK with the response its route handler returns", async () => {
    const app = createApp();
    app.on("ACK", () => RESPONSE_OK);

    expect(await app.handle(toBytes(SAMPLE_ACK), MOCK_CONNECTION)).toBe(
      RESPONSE_OK
    );
  });

  it("replies AE and runs only the global middleware when a route filter throws", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const ran: string[] = [];
    const thrown = new Error("filter failed");
    app.use(observe(seen));
    app.use("ADT^*", async (_ctx, next) => {
      ran.push("scoped");
      await next();
    });
    app.on(
      () => {
        throw thrown;
      },
      () => RESPONSE_OK
    );

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE|MSG001|Application internal error"
    );
    expect(seen.error).toBe(thrown);
    expect(ran).toEqual([]);
  });

  it("replies AE echoing MSH-10 to a payload that is not UTF-8, running only the global middleware", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const ran: string[] = [];
    app.use(observe(seen));
    app.use("*", async (_ctx, next) => {
      ran.push("scoped");
      await next();
    });
    app.on("*", () => {
      ran.push("handler");
      return RESPONSE_OK;
    });
    const latin1 = Uint8Array.from(
      `${SAMPLE_ADT}\rNTE|1||Jos\u00E9`,
      (ch) => ch.codePointAt(0) as number
    );

    const response = await app.handle(latin1, MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE|MSG001|Application internal error"
    );
    expect(seen.error).toBeInstanceOf(MllpServerError);
    expect((seen.error as MllpServerError).code).toBe("INCOMPATIBLE_CHARSET");
    expect(ran).toEqual([]);
  });

  it("replies AE without running the route handler when the parser throws", async () => {
    const thrown = new Error("parser failed");
    const app = new Mllp().parser(unified().use(throwingParser(thrown)));
    const seen: { error?: Error; msa?: string } = {};
    const ran: string[] = [];
    app.use(observe(seen));
    app.on("*", () => {
      ran.push("handler");
      return RESPONSE_OK;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(response?.raw.split("\r")[1]).toBe(
      "MSA|AE||Application internal error"
    );
    expect(seen.error).toBe(thrown);
    expect(ran).toEqual([]);
  });
});

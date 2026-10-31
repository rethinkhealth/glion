// oxlint-disable require-await
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
import { CharsetError } from "@glion/util-charset";
import { unified } from "unified";
import type { Plugin } from "unified";

import { Mllp } from "../../src/server/mllp";

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

const RESPONSE_OK = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };
const RESPONSE_REJECT = {
  raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AR|MSG002|Unsupported",
};

function toBytes(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

const text = (reply: Uint8Array | undefined) =>
  reply ? new TextDecoder().decode(reply) : undefined;

function createApp() {
  return new Mllp();
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
      .on("*", async () => RESPONSE_OK)
      .onError(async () => ({ raw: "MSA|AE|error" }));
    expect(result).toBe(app);
  });

  describe("parser() lifecycle stage", () => {
    it("reads a message with @glion/parser when no processor is given", async () => {
      const app = new Mllp().on("*", () => RESPONSE_OK);

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toBe(RESPONSE_OK.raw);
    });

    it("rejects a message that does not start with an MSH, running no middleware, when no processor is given", async () => {
      const ran: string[] = [];
      const app = new Mllp()
        .use(async (_ctx, next) => {
          ran.push("middleware");
          await next();
        })
        .on("*", () => {
          ran.push("handler");
          return RESPONSE_OK;
        });

      await expect(app.handle(toBytes("PID|1||12345"))).rejects.toThrow(
        "The first segment is not the message header segment; a message must start with the message header segment (`MSH`)."
      );
      expect(ran).toEqual([]);
    });

    it("last-write-wins when parser() called multiple times", async () => {
      // Create a second distinct processor so we can tell them apart
      const second = unified().use(hl7v2Parser).freeze();
      const firstSpy = vi.spyOn(parseHL7v2, "parse");
      const secondSpy = vi.spyOn(second, "parse");

      const app = new Mllp().parser(parseHL7v2).parser(second);
      app.on("*", async () => RESPONSE_OK);

      await app.handle(toBytes(SAMPLE_ADT));
      expect(firstSpy).not.toHaveBeenCalled();
      expect(secondSpy).toHaveBeenCalledOnce();

      firstSpy.mockRestore();
      secondSpy.mockRestore();
    });

    it("ctx.req.tree is the tree the processor read", async () => {
      const app = createApp();
      let astType = "";
      let childrenCount = 0;

      app.on("ADT^A01", (ctx) => {
        astType = ctx.req.tree.type;
        childrenCount = ctx.req.tree.children.length;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT));
      expect(astType).toBe("root");
      expect(childrenCount).toBeGreaterThan(0);
    });

    it("populates ctx.req.file with VFile", async () => {
      const app = createApp();
      let fileExists = false;

      app.on("ADT^A01", async (ctx) => {
        fileExists = ctx.req.file !== undefined;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(SAMPLE_ADT));
      expect(fileExists).toBe(true);
    });

    it("populates ctx.req.result() when processor has a compiler", async () => {
      const app = new Mllp().parser(parseHL7v2); // includes hl7v2Jsonify
      let resultExists = false;

      app.on("ADT^A01", async (ctx) => {
        resultExists = (await ctx.req.result()) !== undefined;
        return RESPONSE_OK;
      });

      await app.handle(toBytes(`${SAMPLE_ADT}\rPV1|1|I`));
      expect(resultExists).toBe(true);
    });

    it("rejects with the first fatal message, running no middleware, a message the processor reports one for", async () => {
      const ran: string[] = [];
      const app = new Mllp()
        .parser(parseHL7v2)
        .use(async (_ctx, next) => {
          ran.push("middleware");
          await next();
        })
        .on("*", () => {
          ran.push("handler");
          return RESPONSE_OK;
        });

      // An ADT^A01 with no PV1, which the event schema requires.
      await expect(app.handle(toBytes(SAMPLE_ADT))).rejects.toThrow(
        "Segment `PV1` is missing; the event schema requires it at this point."
      );
      expect(ran).toEqual([]);
    });

    it("rejects with what the parser throws, running no middleware and no route", async () => {
      const ran: string[] = [];
      const failure = new Error("parser failure");
      const app = new Mllp()
        .parser(unified().use(throwingParser(failure)).freeze())
        .use(async (_ctx, next) => {
          ran.push("middleware");
          await next();
        })
        .on("*", () => {
          ran.push("handler");
          return RESPONSE_OK;
        });

      await expect(app.handle(toBytes(SAMPLE_ADT))).rejects.toBe(failure);
      expect(ran).toEqual([]);
    });
  });

  it("routes ADT^A01 to correct handler", async () => {
    const app = createApp();
    app.on("ADT^A01", async () => RESPONSE_OK);
    app.on("*", async () => RESPONSE_REJECT);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe(RESPONSE_OK.raw);
  });

  it("routes to catch-all when no specific match", async () => {
    const app = createApp();
    app.on("ADT^A01", async () => RESPONSE_OK);
    app.on("*", async () => RESPONSE_REJECT);

    const response = await app.handle(toBytes(SAMPLE_ORU));
    expect(text(response)).toBe(RESPONSE_REJECT.raw);
  });

  it("returns undefined when no handler matches - no router", async () => {
    const app = createApp();
    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(response).toBeUndefined();
  });

  it("returns undefined when no handler matches - with a non-matching route", async () => {
    const app = createApp();

    app.on("ORU^O12", async () => RESPONSE_OK);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(response).toBeUndefined();
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

    await app.handle(toBytes(SAMPLE_ADT));
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

    await app.handle(toBytes(SAMPLE_ORU));
    expect(adtMiddlewareRan.value).toBe(false);

    await app.handle(toBytes(SAMPLE_ADT));
    expect(adtMiddlewareRan.value).toBe(true);

    adtMiddlewareRan.value = false;
    await app.handle(toBytes(SAMPLE_ORU));
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

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("Blocked by middleware");
    expect(handlerRan.value).toBe(false);
  });

  it("calls error handler when handler throws", async () => {
    const app = createApp();
    app.on("*", async () => {
      throw new Error("Handler crashed");
    });
    app.onError(async () => ({
      raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AE|MSG001|Custom error handling",
    }));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("Custom error handling");
  });

  it("re-throws when handler throws without error handler", async () => {
    const app = createApp();
    app.on("*", async () => {
      throw new Error("crash");
    });

    await expect(app.handle(toBytes(SAMPLE_ADT))).rejects.toThrow("crash");
  });

  it("re-throws error handler's error when error handler itself throws", async () => {
    const app = createApp();
    app.on("*", async () => {
      throw new Error("handler failed");
    });
    app.onError(() => {
      throw new Error("error handler also failed");
    });

    await expect(app.handle(toBytes(SAMPLE_ADT))).rejects.toThrow(
      "error handler also failed"
    );
  });

  describe("filter function routing", () => {
    it("routes with filter on messageType", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.header.messageCode === "ADT",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter rejects non-matching messages", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.header.messageCode === "ADT",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ORU));
      expect(response).toBeUndefined();
    });

    it("filter can inspect triggerEvent", async () => {
      const app = createApp();
      app.on(
        (ctx) =>
          ctx.req.header.messageCode === "ADT" &&
          ctx.req.header.triggerEvent === "A01",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter can inspect version", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.header.version === "2.3",
        async () => RESPONSE_OK
      );

      const v23Response = await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(text(v23Response)).toContain("MSA|AA");

      const v251Response = await app.handle(toBytes(SAMPLE_ADT));
      expect(v251Response).toBeUndefined();
    });

    it("filter can inspect controlId", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.header.controlId === "MSG001",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");

      const noMatch = await app.handle(toBytes(SAMPLE_ORU));
      expect(noMatch).toBeUndefined();
    });

    it("filter can inspect ctx.env", async () => {
      const app = new Mllp<{ region: string }>();
      app.on(
        (ctx) => ctx.env.region === "north",
        async () => RESPONSE_OK
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), {
        region: "north",
      });
      expect(text(response)).toContain("MSA|AA");
    });

    it("string pattern wins over filter when registered first", async () => {
      const app = createApp();
      app.on("ADT^A01", async () => RESPONSE_OK);
      app.on(
        (ctx) => ctx.req.header.messageCode === "ADT",
        async () => RESPONSE_REJECT
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter wins over string pattern when registered first", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.header.messageCode === "ADT",
        async () => RESPONSE_OK
      );
      app.on("ADT^A01", async () => RESPONSE_REJECT);

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("scoped middleware with filter function", async () => {
      const app = createApp();
      const middlewareRan = { value: false };

      app.use(
        (ctx) => ctx.req.header.version === "2.3",
        async (_ctx, next) => {
          middlewareRan.value = true;
          await next();
        }
      );
      app.on("*", async () => RESPONSE_OK);

      await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(middlewareRan.value).toBe(true);

      middlewareRan.value = false;
      await app.handle(toBytes(SAMPLE_ADT));
      expect(middlewareRan.value).toBe(false);
    });

    it("filter with ast inspection", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.req.tree.children.length > 2,
        async () => RESPONSE_OK
      );

      // SAMPLE_ADT has 3 segments (MSH, EVN, PID)
      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");

      // SAMPLE_ADT_V23 has 2 segments (MSH, PID) — should not match
      const noMatch = await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(noMatch).toBeUndefined();
    });
  });
});

/** SAMPLE_ADT with an NTE in ISO-8859-1, `Café`: one 0xE9 byte, not UTF-8. */
const LATIN1_ADT = Uint8Array.from(
  `${SAMPLE_ADT}\rNTE|1||Café`,
  (ch) => ch.codePointAt(0) as number
);

describe("handle() env", () => {
  it("passes the env it is given to ctx.env unchanged", async () => {
    const env = { region: "north" };
    let seen: unknown;
    const app = new Mllp<typeof env>().on("*", (ctx) => {
      seen = ctx.env;
      return RESPONSE_OK;
    });

    await app.handle(toBytes(SAMPLE_ADT), env);
    expect(seen).toBe(env);
  });

  it("leaves ctx.env undefined when it is given none", async () => {
    let seen: unknown = "unset";
    const app = createApp().on("*", (ctx) => {
      seen = ctx.env;
      return RESPONSE_OK;
    });

    await app.handle(toBytes(SAMPLE_ADT));
    expect(seen).toBeUndefined();
  });

  it("replies when called detached from the app", async () => {
    const { handle } = createApp().on("*", () => RESPONSE_OK);

    const response = await handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe(RESPONSE_OK.raw);
  });
});

describe("handle() payload", () => {
  it("rejects with the CharsetError of a payload that is not UTF-8, running no middleware and no route", async () => {
    const ran: string[] = [];
    const app = createApp()
      .use(async (_ctx, next) => {
        ran.push("middleware");
        await next();
      })
      .on("*", () => {
        ran.push("handler");
        return RESPONSE_OK;
      });

    await expect(app.handle(LATIN1_ADT)).rejects.toThrow(CharsetError);
    expect(ran).toEqual([]);
  });
});

// oxlint-disable require-await
import { setTimeout as sleep } from "node:timers/promises";

import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  Hl7ErrorCode,
} from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/hl7v2";
import { defaultPreprocessors, hl7v2Parser } from "@glion/parser";
import type { PreprocessorStep } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError } from "@glion/util-charset";
import { value } from "@glion/util-query";
import { unified } from "unified";
import type { Plugin } from "unified";

import type { MllpServerError } from "../../src/errors";
import { Mllp } from "../../src/server/mllp";
import type { Reply } from "../../src/server/reply";
import type { AckOptions, Middleware } from "../../src/server/types";

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

const hl7 = (message: string): Root => parseHL7v2.parse(message);

const RESPONSE_OK = hl7("MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001");
const RESPONSE_OTHER = hl7("MSH|^~\\&||||||||||2.5.1\rMSA|CA|MSG002");

/** A reply as HL7v2 text: `handle()`'s bytes, or the `Reply` on `ctx.res`. */
function text(reply: Uint8Array | Reply | undefined): string | undefined {
  if (reply === undefined) {
    return undefined;
  }
  return new TextDecoder().decode(
    reply instanceof Uint8Array ? reply : reply.bytes
  );
}

function toBytes(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

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
      .on("*", async (ctx) => ctx.reply(RESPONSE_OK));
    expect(result).toBe(app);
  });

  describe("parser() lifecycle stage", () => {
    it("throws MllpServerError when handle() called without parser", async () => {
      const app = new Mllp();
      app.on("*", async (ctx) => ctx.reply(RESPONSE_OK));

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(response?.raw.split("\r")[1]).toBe("MSA|AA|MSG001");
    });

    it("rejects a message that does not start with an MSH, with no reply, when no processor is given", async () => {
      const ran: string[] = [];
      const seen: Error[] = [];
      const app = new Mllp()
        .onError((raised) => {
          seen.push(raised);
        })
        .use(async (_ctx, next) => {
          ran.push("middleware");
          await next();
        })
        .on("*", () => {
          ran.push("handler");
          return RESPONSE_OK;
        });

      const response = await app.handle(toBytes("PID|1||12345"));
      expect(response).toBeUndefined();
      expect(ran).toEqual([]);
      expect(seen.map((raised) => raised.message)).toEqual([
        "The first segment is not the message header segment; a message must start with the message header segment (`MSH`).",
      ]);
    });

    it("last-write-wins when parser() called multiple times", async () => {
      // Create a second distinct processor so we can tell them apart
      const second = unified().use(hl7v2Parser).freeze();
      const firstSpy = vi.spyOn(parseHL7v2, "parse");
      const secondSpy = vi.spyOn(second, "parse");

      const app = new Mllp().parser(parseHL7v2).parser(second);
      app.on("*", async (ctx) => ctx.reply(RESPONSE_OK));

      await app.handle(toBytes(SAMPLE_ADT));
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
        return ctx.reply(RESPONSE_OK);
      });

      await app.handle(toBytes(SAMPLE_ADT));
      expect(astType).toBe("root");
      expect(childrenCount).toBeGreaterThan(0);
    });

    it("ctx.tree() returns the transformed tree lazily", async () => {
      const app = createApp();
      let treeType = "";

      app.on("ADT^A01", async (ctx) => {
        const tree = await ctx.tree();
        treeType = tree.type;
        return ctx.reply(RESPONSE_OK);
      });

      await app.handle(toBytes(SAMPLE_ADT));
      expect(treeType).toBe("root");
    });

    it("populates ctx.file with VFile", async () => {
      const app = createApp();
      let fileExists = false;

      app.on("ADT^A01", async (ctx) => {
        fileExists = ctx.file !== undefined;
        return ctx.reply(RESPONSE_OK);
      });

      await app.handle(toBytes(SAMPLE_ADT));
      expect(fileExists).toBe(true);
    });

    it("populates ctx.result when processor has a compiler", async () => {
      const app = new Mllp().parser(parseHL7v2); // includes hl7v2Jsonify
      let resultExists = false;

      app.on("ADT^A01", async (ctx) => {
        resultExists = (await ctx.result()) !== undefined;
        return ctx.reply(RESPONSE_OK);
      });

      await app.handle(toBytes(`${SAMPLE_ADT}\rPV1|1|I`));
      expect(resultExists).toBe(true);
    });

    it("replies AE, running no middleware, to a message the processor reports a fatal message for, and onError() observes it", async () => {
      const ran: string[] = [];
      const seen: Error[] = [];
      const app = new Mllp()
        .parser(parseHL7v2)
        .onError((raised) => {
          seen.push(raised);
        })
        .use(async (_ctx, next) => {
          ran.push("middleware");
          await next();
        })
        .on("*", () => {
          ran.push("handler");
          return RESPONSE_OK;
        });

      // An ADT^A01 with no PV1, which the event schema requires.
      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(response?.raw.split("\r")[1]).toBe("MSA|AE|MSG001");
      expect(ran).toEqual([]);
      expect(seen.map((raised) => raised.message)).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });
  });

  it("routes ADT^A01 to correct handler", async () => {
    const app = createApp();
    app.on("ADT^A01", async (ctx) => ctx.reply(RESPONSE_OK));
    app.on("*", async (ctx) => ctx.reply(RESPONSE_OTHER));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe(toHl7v2(RESPONSE_OK));
  });

  it("routes to catch-all when no specific match", async () => {
    const app = createApp();
    app.on("ADT^A01", async (ctx) => ctx.reply(RESPONSE_OK));
    app.on("*", async (ctx) => ctx.reply(RESPONSE_OTHER));

    const response = await app.handle(toBytes(SAMPLE_ORU));
    expect(text(response)).toBe(toHl7v2(RESPONSE_OTHER));
  });

  it("replies AR when no handler matches - no router", async () => {
    const app = createApp();
    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("\rMSA|AR|");
  });

  it("replies AR when no handler matches - with a non-matching route", async () => {
    const app = createApp();

    app.on("ORU^O12", async (ctx) => ctx.reply(RESPONSE_OK));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("\rMSA|AR|");
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
      return ctx.reply(RESPONSE_OK);
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
    app.on("*", async (ctx) => ctx.reply(RESPONSE_OK));

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

    app.use(async (ctx) =>
      ctx.reply(
        hl7("MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001|Answered by middleware")
      )
    );
    app.on("*", async (ctx) => {
      handlerRan.value = true;
      return ctx.reply(RESPONSE_OK);
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("Answered by middleware");
    expect(handlerRan.value).toBe(false);
  });

  describe("filter function routing", () => {
    it("routes with filter on messageType", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter rejects non-matching messages", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const response = await app.handle(toBytes(SAMPLE_ORU));
      expect(text(response)).toContain("\rMSA|AR|");
    });

    it("filter can inspect triggerEvent", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT" && ctx.triggerEvent === "A01",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter can inspect version", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.version === "2.3",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const v23Response = await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(text(v23Response)).toContain("MSA|AA");

      const v251Response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(v251Response)).toContain("\rMSA|AR|");
    });

    it("filter can inspect controlId", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.controlId === "MSG001",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");

      const noMatch = await app.handle(toBytes(SAMPLE_ORU));
      expect(text(noMatch)).toContain("\rMSA|AR|");
    });

    it("filter can inspect ctx.env", async () => {
      const app = new Mllp<{ region: string }>();
      app.on(
        (ctx) => ctx.env.region === "north",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      const response = await app.handle(toBytes(SAMPLE_ADT), {
        region: "north",
      });
      expect(text(response)).toContain("MSA|AA");
    });

    it("string pattern wins over filter when registered first", async () => {
      const app = createApp();
      app.on("ADT^A01", async (ctx) => ctx.reply(RESPONSE_OK));
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async (ctx) => ctx.reply(RESPONSE_OTHER)
      );

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
    });

    it("filter wins over string pattern when registered first", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.messageType === "ADT",
        async (ctx) => ctx.reply(RESPONSE_OK)
      );
      app.on("ADT^A01", async (ctx) => ctx.reply(RESPONSE_OTHER));

      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");
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
      app.on("*", async (ctx) => ctx.reply(RESPONSE_OK));

      await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(middlewareRan.value).toBe(true);

      middlewareRan.value = false;
      await app.handle(toBytes(SAMPLE_ADT));
      expect(middlewareRan.value).toBe(false);
    });

    it("filter with ast inspection", async () => {
      const app = createApp();
      app.on(
        (ctx) => ctx.ast.children.length > 2,
        async (ctx) => ctx.reply(RESPONSE_OK)
      );

      // SAMPLE_ADT has 3 segments (MSH, EVN, PID)
      const response = await app.handle(toBytes(SAMPLE_ADT));
      expect(text(response)).toContain("MSA|AA");

      // SAMPLE_ADT_V23 has 2 segments (MSH, PID) — should not match
      const noMatch = await app.handle(toBytes(SAMPLE_ADT_V23));
      expect(text(noMatch)).toContain("\rMSA|AR|");
    });
  });
});

/** A middleware that records `ctx.error` and the reply's MSA after `next()`. */
function observe(seen: { error?: Error; msa?: string }): Middleware {
  return async (ctx, next) => {
    await next();
    seen.error = ctx.error;
    seen.msa = text(ctx.res)?.split("\r")[1];
  };
}

const SAMPLE_ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

/** SAMPLE_ADT with an NTE in ISO-8859-1, `Café`: one 0xE9 byte, not UTF-8. */
const LATIN1_ADT = Uint8Array.from(
  `${SAMPLE_ADT}\rNTE|1||Caf\u00E9`,
  (ch) => ch.codePointAt(0) as number
);

describe("handle() env", () => {
  it("passes the env it is given to ctx.env unchanged", async () => {
    const env = { region: "north" };
    let seen: unknown;
    const app = new Mllp<typeof env>().on("*", (ctx) => {
      seen = ctx.env;
      return ctx.ack();
    });

    await app.handle(toBytes(SAMPLE_ADT), env);
    expect(seen).toBe(env);
  });

  it("leaves ctx.env undefined when it is given none", async () => {
    let seen: unknown = "unset";
    const app = createApp().on("*", (ctx) => {
      seen = ctx.env;
      return ctx.ack();
    });

    await app.handle(toBytes(SAMPLE_ADT));
    expect(seen).toBeUndefined();
  });

  it("replies when called detached from the app", async () => {
    const { handle } = createApp().on("*", (ctx) => ctx.ack());

    const response = await handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toContain("\rMSA|AA|MSG001");
  });
});

describe("acknowledgment defaults", () => {
  it("replies AA to the sender, from the receiver, when the route handler returns ctx.ack()", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    const [msh, msa] = text(response)?.split("\r") ?? [];
    expect(msh).toMatch(
      /^MSH\|\^~\\&\|RecvApp\|RecvFac\|SendApp\|SendFac\|\d{14}[+-]\d{4}\|\|ACK\^A01\^ACK\|/
    );
    expect(msa).toBe("MSA|AA|MSG001");
  });

  it("dates the AR of a message no route matches in the time zone the app is given", async () => {
    const app = new Mllp({ timeZone: "Asia/Kathmandu" }).parser(parseHL7v2);
    app.on("ORU^R01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    const [msh, msa] = text(response)?.split("\r") ?? [];
    expect(msh).toMatch(
      /^MSH\|\^~\\&\|RecvApp\|RecvFac\|SendApp\|SendFac\|\d{14}\+0545\|\|ACK\^A01\^ACK\|/
    );
    expect(msa).toBe("MSA|AR|MSG001");
  });

  it("writes the NAK of a thrown error with the delimiters and in the time zone the app is given", async () => {
    const app = new Mllp({
      delimiters: { field: "#" },
      timeZone: "Asia/Kathmandu",
    });
    app.on("ADT^A01", () => {
      throw new Error("Lookup failed");
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    const [msh, msa] = text(response)?.split("\r") ?? [];
    expect(msh).toMatch(
      /^MSH#\^~\\&#RecvApp#RecvFac#SendApp#SendFac#\d{14}\+0545##ACK\^A01\^ACK#/
    );
    expect(msa).toBe("MSA#AE#MSG001");
  });

  it("writes ctx.ack() with the delimiters and in the time zone the app is given", async () => {
    const app = new Mllp({
      delimiters: { field: "#" },
      timeZone: "Asia/Kathmandu",
    });
    app.on("ADT^A01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    const [msh, msa] = text(response)?.split("\r") ?? [];
    expect(msh).toMatch(/^MSH#\^~\\&#.*#\d{14}\+0545##ACK\^A01\^ACK#/);
    expect(msa).toBe("MSA#CA#MSG001");
  });

  it("throws a RangeError when the app is given a time zone that is not an IANA time zone name", () => {
    expect(() => new Mllp({ timeZone: "Mars/Olympus_Mons" })).toThrow(
      RangeError
    );
  });

  it("writes the AR of a message no route matches with the serializer the app is given", async () => {
    const app = new Mllp({
      serializer: (tree) => `MSA-1 is ${value(tree, "MSA.1")?.value}`,
    }).parser(parseHL7v2);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe("MSA-1 is AR");
  });

  it("writes the NAK of a thrown error with the serializer the app is given", async () => {
    const app = new Mllp({
      serializer: (tree) => `MSA-1 is ${value(tree, "MSA.1")?.value}`,
    });
    app.on("ADT^A01", () => {
      throw new Error("Lookup failed");
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe("MSA-1 is AE");
  });

  it("writes ctx.ack() with the serializer the app is given", async () => {
    const app = new Mllp({
      serializer: (tree) => `MSA-1 is ${value(tree, "MSA.1")?.value}`,
    });
    app.on("ADT^A01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe("MSA-1 is CA");
  });

  it("echoes an escape sequence as received when the app parses and serializes without escape handling", async () => {
    const app = new Mllp({
      serializer: (tree) => toHl7v2(tree, undefined, { encodeEscapes: false }),
    }).parser(unified().use(hl7v2Parser, { decodeEscapes: false }).freeze());
    app.on("ADT^A01", (ctx) => ctx.ack());

    // MSH-3, the sending application, is `R&D` written as `R\T\D`; the
    // acknowledgment's MSH-5 echoes it.
    const response = await app.handle(
      toBytes(SAMPLE_ADT.replace("|SendApp|", "|R\\T\\D|"))
    );
    expect(text(response)?.split("\r")[0]).toMatch(
      /^MSH\|\^~\\&\|RecvApp\|RecvFac\|R\\T\\D\|SendFac\|/
    );
  });

  it("replies with ctx.ack() and the code it is given", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|CA|MSG001");
  });

  it("replies with the HL7v2 message the route handler returns", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OTHER));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)).toBe(toHl7v2(RESPONSE_OTHER));
  });

  it("replaces a reply a middleware set before next() with the route handler's", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      ctx.res = ctx.reply(RESPONSE_OTHER);
      await next();
    });
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AA|MSG001");
  });

  it("replies with the code of a thrown AckException, never its message or text", async () => {
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

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(text(response)).not.toContain("12345");
    expect(text(response)).not.toContain("Patient not on file");
    expect(seen.error).toBe(thrown);
  });

  it("replies AE to any other throw, never its message", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    app.use(observe(seen));
    app.on("ADT^A01", () => {
      throw thrown;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(text(response)).not.toContain("ECONNREFUSED");
    expect(seen).toEqual({
      error: thrown,
      msa: "MSA|AE|MSG001",
    });
  });

  it("replies AE without running the route handler when a middleware throws before next()", async () => {
    const app = createApp();
    const ran: string[] = [];
    app.use(() => {
      throw new Error("unauthorized");
    });
    app.on("ADT^A01", (ctx) => {
      ran.push("handler");
      return ctx.ack();
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(ran).toEqual([]);
  });

  it("lets a middleware answer an error with an accept after next()", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      await next();
      if (ctx.error) {
        ctx.res = ctx.ack();
      }
    });
    app.on("ADT^A01", () => {
      throw new Error("duplicate key: the message is already saved");
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AA|MSG001");
  });

  it("replies with the NAK of an error a middleware throws after the route handler replied", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new Error("audit write failed");
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      throw thrown;
    });
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen).toEqual({ error: thrown, msa: "MSA|AE|MSG001" });
  });

  it("replaces a middleware's rewrite of the reply with the NAK of a middleware outside it that throws", async () => {
    const app = createApp();
    app.use(async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    });
    app.use(async (ctx, next) => {
      await next();
      ctx.res = ctx.ack({ code: AckCode.CommitAccept });
    });
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
  });

  it("answers the error a middleware throws for an earlier one, so a middleware changes the NAK's code", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const first = new Error("patient lookup returned no rows");
    const second = new AckApplicationReject("Unknown patient", {
      cause: first,
    });
    app.use(observe(seen));
    app.use(async (ctx, next) => {
      await next();
      if (ctx.error === first) {
        throw second;
      }
    });
    app.on("ADT^A01", () => {
      throw first;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AR|MSG001");
    expect(seen.error).toBe(second);
    expect(second.cause).toBe(first);
  });

  it("answers the outermost of two errors middleware throw after the route handler", async () => {
    const app = createApp();
    const saved: string[] = [];
    app.use(async (_ctx, next) => {
      await next();
      throw new AckApplicationReject("Rejected", {});
    });
    app.use(async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    });
    app.on("ADT^A01", (ctx) => {
      saved.push(ctx.controlId);
      return ctx.ack();
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AR|MSG001");
    expect(saved).toEqual(["MSG001"]);
  });

  it("replies with the NAK of an error, not a reply a middleware wrote before next()", async () => {
    const app = createApp();
    const ran: string[] = [];
    app.use(async (ctx, next) => {
      ctx.res = ctx.ack();
      await next();
    });
    app.use(() => {
      throw new AckApplicationReject("Rejected", {});
    });
    app.on("ADT^A01", (ctx) => {
      ran.push("handler");
      return ctx.ack();
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AR|MSG001");
    expect(ran).toEqual([]);
  });

  it("replies with the NAK of an error a middleware throws after the route handler returned null", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const thrown = new Error("audit write failed");
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      throw thrown;
    });
    app.on("ADT^A01", () => null);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen.error).toBe(thrown);
  });

  it("sends no reply when a middleware returns without calling next()", async () => {
    const app = createApp();
    app.use(() => {
      // dropped
    });
    app.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OK));

    expect(await app.handle(toBytes(SAMPLE_ADT))).toBeUndefined();
  });

  it("replies AR when no route matches", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ORU^R01", (ctx) => ctx.reply(RESPONSE_OK));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AR|MSG001");
    expect(seen.error).toBeInstanceOf(AckApplicationReject);
    expect((seen.error as AckApplicationReject).errorCode).toBe(
      Hl7ErrorCode.UnsupportedMessageType
    );
  });

  it("sends no reply to an ACK no route matches", async () => {
    const app = createApp();

    expect(await app.handle(toBytes(SAMPLE_ACK))).toBeUndefined();
  });

  it("sends no reply to an ACK whose route handler returns null", async () => {
    const app = createApp();
    app.on("*", () => null);

    expect(await app.handle(toBytes(SAMPLE_ACK))).toBeUndefined();
  });

  it("sends no reply to an ACK whose route handler throws", async () => {
    const app = createApp();
    app.on("*", () => {
      throw new Error("crash");
    });

    expect(await app.handle(toBytes(SAMPLE_ACK))).toBeUndefined();
  });

  it("replies to an ACK with the response its route handler returns", async () => {
    const app = createApp();
    app.on("ACK", (ctx) => ctx.reply(RESPONSE_OK));

    expect(text(await app.handle(toBytes(SAMPLE_ACK)))).toBe(
      toHl7v2(RESPONSE_OK)
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
      (ctx) => ctx.reply(RESPONSE_OK)
    );

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen.error).toBe(thrown);
    expect(ran).toEqual([]);
  });

  it("replies AE echoing MSH-10 to a payload that is not UTF-8, running no middleware and no route", async () => {
    const app = createApp();
    const ran: string[] = [];
    app.use(async (_ctx, next) => {
      ran.push("global");
      await next();
    });
    app.on("*", (ctx) => {
      ran.push("handler");
      return ctx.reply(RESPONSE_OK);
    });

    const response = await app.handle(LATIN1_ADT);
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(ran).toEqual([]);
  });

  it("lets each onError() handler observe the CharsetError of a payload that is not UTF-8, in order", async () => {
    const env = { region: "test" };
    const seen: [string, Error, unknown][] = [];
    const app = createApp()
      .onError((raised, received) => {
        seen.push(["first", raised, received]);
      })
      .onError((raised, received) => {
        seen.push(["second", raised, received]);
      });

    await app.handle(LATIN1_ADT, env);
    expect(seen.map(([name]) => name)).toEqual(["first", "second"]);
    expect(seen[0]?.[1]).toBeInstanceOf(CharsetError);
    expect(seen[0]?.[2]).toBe(env);
  });

  it("waits for an onError() handler that returns a promise before it resolves", async () => {
    let observed = false;
    const app = createApp().onError(async () => {
      await sleep(5);
      observed = true;
    });

    await app.handle(LATIN1_ADT);
    expect(observed).toBe(true);
  });

  it("lets onError() observe a handler throw when it is raised, before an outer middleware goes on", async () => {
    const thrown = new Error("handler failed");
    const order: string[] = [];
    const app = createApp()
      .onError((raised) => {
        order.push(raised === thrown ? "onError" : "other");
      })
      .use(async (_ctx, next) => {
        await next();
        order.push("after next()");
      })
      .on("*", () => {
        throw thrown;
      });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(response?.raw.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(order).toEqual(["onError", "after next()"]);
  });

  it("lets onError() observe each error a message raises, and the AR of a message no route matches", async () => {
    const seen: Error[] = [];
    const app = createApp()
      .onError((raised) => {
        seen.push(raised);
      })
      .use(async (_ctx, next) => {
        await next();
        throw new Error("audit write failed");
      });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(response?.raw.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen.map(({ message }) => message)).toEqual([
      "No route matches the message's type and trigger event (MSH-9).",
      "audit write failed",
    ]);
  });

  it("sends no reply to a payload whose MSH is not UTF-8, and still lets onError() observe it", async () => {
    const seen: Error[] = [];
    const app = createApp().onError((raised) => {
      seen.push(raised);
    });
    // MSH-4, the sending facility, is `Café` in ISO-8859-1.
    const payload = Uint8Array.from(
      SAMPLE_ADT.replace("|SendFac|", "|Caf\u00E9|"),
      (ch) => ch.codePointAt(0) as number
    );

    expect(await app.handle(payload)).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it("sends no reply to an ACK that is not UTF-8", async () => {
    const app = createApp();
    app.on("*", (ctx) => ctx.reply(RESPONSE_OK));
    const ack = Uint8Array.from(
      `${SAMPLE_ACK}|Caf\u00E9`,
      (ch) => ch.codePointAt(0) as number
    );

    expect(await app.handle(ack)).toBeUndefined();
  });

  it("replies AE with INVALID_REPLY when the route handler returns a value that is not a Reply", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", () => ({ insertedId: 42 }) as unknown as Reply);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("INVALID_REPLY");
    expect(seen.error?.message).toBe(
      "The value given as the reply is not a `Reply`; a reply is built by `ctx.ack()` or `ctx.reply()`."
    );
  });

  it("replies AE with INVALID_REPLY when the route handler returns a tree instead of a Reply", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", () => RESPONSE_OK as unknown as Reply);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("INVALID_REPLY");
  });

  it("replies AE with INVALID_REPLY when a middleware writes to ctx.res a value that is not a Reply", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.use(async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&" } as unknown as Reply;
    });
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("INVALID_REPLY");
  });

  it("replies AE with INVALID_REPLY when a middleware returns a value that is not a Reply", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.use(() => ({ raw: "MSH|^~\\&" }) as unknown as Reply);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("INVALID_REPLY");
  });

  it("sends no reply to a payload with no segments, or one that does not start with an MSH", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.ack());

    for (const payload of ["", "\r", "\n", " ", "PID|1||12345"]) {
      expect(await app.handle(toBytes(payload))).toBeUndefined();
    }
  });

  it("sends no NAK to a payload that does not start with an MSH, even when its route handler throws", async () => {
    const app = createApp();
    app.on("*", () => {
      throw new Error("handler failed");
    });

    for (const payload of ["", "PID|1||12345"]) {
      expect(await app.handle(toBytes(payload))).toBeUndefined();
    }
  });

  it("replies with the code of an AckException made by another copy of @glion/ack", async () => {
    const app = createApp();
    const foreign = Object.assign(new Error("Rejected"), {
      [Symbol.for("@glion/ack/AckException")]: true,
      code: AckCode.CommitReject,
    });
    app.on("ADT^A01", () => {
      throw foreign;
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|CR|MSG001");
  });

  it("replies AE with INVALID_REPLY when the route handler returns nothing", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", (() => {
      // forgot to return the reply
    }) as unknown as () => Reply);

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen.error).toBeInstanceOf(MllpServerError);
    expect(seen.error?.message).toBe(
      "The value given as the reply is not a `Reply`; a reply is built by `ctx.ack()` or `ctx.reply()`."
    );
  });

  it("sends no reply when the route handler returns null", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", () => null);

    expect(await app.handle(toBytes(SAMPLE_ADT))).toBeUndefined();
    expect(seen).toEqual({ error: undefined, msa: undefined });
  });

  it("drops a reply a middleware set before next() when the route handler returns null", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      ctx.res = ctx.reply(RESPONSE_OTHER);
      await next();
    });
    app.on("ADT^A01", () => null);

    expect(await app.handle(toBytes(SAMPLE_ADT))).toBeUndefined();
  });

  it("escapes a VT or FS byte in a value of the reply", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(
      toBytes(SAMPLE_ADT.replace("RecvApp", "Recv\u000BApp\u001C"))
    );
    expect(text(response)?.split("\r")[0]).toContain("|Recv\\X0B\\App\\X1C\\|");
  });

  it("replies AE with REPLY_IS_NAK when ctx.ack() is given a NAK code", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", (ctx) =>
      ctx.ack({ code: AckCode.ApplicationReject } as unknown as AckOptions)
    );

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("REPLY_IS_NAK");
    expect(seen.error?.message).toBe(
      "The reply's acknowledgment code (MSA-1) is a NAK code; a reply accepts the message, and a NAK is the reply to a thrown error."
    );
  });

  it("replies AE with REPLY_IS_NAK when ctx.reply() is given a message whose MSA-1 is a NAK code", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", (ctx) =>
      ctx.reply(hl7("MSH|^~\\&||||||||||2.5.1\rMSA|AR|MSG001"))
    );

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("REPLY_IS_NAK");
  });

  it("replies AE with REPLY_WITHOUT_MSH when ctx.reply() is given a message that does not start with an MSH", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", (ctx) => ctx.reply(hl7("MSA|AA|MSG001")));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("REPLY_WITHOUT_MSH");
    expect(seen.error?.message).toBe(
      "The reply does not start with the message header segment (`MSH`); an HL7v2 message starts with one."
    );
  });

  it("replies AE with REPLY_WITHOUT_MSH when ctx.reply() is given a message with no segments", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.on("ADT^A01", (ctx) => ctx.reply({ children: [], type: "root" }));

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("REPLY_WITHOUT_MSH");
  });

  it("keeps a reply a middleware wrote before next() for an ACK no route matches", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      ctx.res = ctx.reply(RESPONSE_OK);
      await next();
    });

    expect(text(await app.handle(toBytes(SAMPLE_ACK)))).toBe(
      toHl7v2(RESPONSE_OK)
    );
  });

  it("replaces a middleware's reply given without next() with the NAK of a middleware outside it that throws", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      throw new Error("metrics backend unavailable");
    });
    app.use((ctx) => ctx.ack());

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen.error?.message).toBe("metrics backend unavailable");
  });

  it("echoes the MSH-10 a route handler writes to the tree before the acknowledgment", async () => {
    const app = createApp();
    app.on("ADT^A01", async (ctx) => {
      const tree = await ctx.tree();
      const msh10 = value(tree, "MSH.10")?.node as { value: string };
      msh10.value = "ENGINE-0001";
      return ctx.ack();
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AA|ENGINE-0001");
  });

  it("answers the MSH the app's parser read, after its own preprocessing", async () => {
    const stripNul: PreprocessorStep = (ctx) => {
      ctx.input = ctx.input.replaceAll("\0", "");
      return ctx;
    };
    const app = new Mllp().parser(
      unified().use(hl7v2Parser, {
        preprocess: [stripNul, ...defaultPreprocessors],
      })
    );
    app.on("ADT^A01", (ctx) => ctx.ack());

    const response = await app.handle(toBytes(`\0\0${SAMPLE_ADT}`));
    const [msh, msa] = text(response)?.split("\r") ?? [];
    expect(msh).toMatch(/^MSH\|\^~\\&\|RecvApp\|RecvFac\|SendApp\|SendFac\|/);
    expect(msa).toBe("MSA|AA|MSG001");
  });

  it("replies AE and records NEXT_CALLED_TWICE when a middleware calls next() a second time", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    const saved: string[] = [];
    app.use(observe(seen));
    app.use(async (_ctx, next) => {
      await next();
      await next().catch(() => {
        // the misuse is recorded whether or not the middleware catches it
      });
    });
    app.on("ADT^A01", (ctx) => {
      saved.push(ctx.controlId);
      return ctx.ack();
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect((seen.error as MllpServerError).code).toBe("NEXT_CALLED_TWICE");
    expect(saved).toEqual(["MSG001"]);
  });

  it("routes on the errors the message raised, not on what a middleware writes to ctx.error", async () => {
    const app = createApp();
    app.use(async (ctx, next) => {
      (ctx as { error?: Error }).error = new Error("PID-3 flagged");
      await next();
    });
    app.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OK));

    expect(text(await app.handle(toBytes(SAMPLE_ADT)))).toBe(
      toHl7v2(RESPONSE_OK)
    );
  });

  it("leaves ctx.error unset for an ACK no route matches", async () => {
    const app = createApp();
    const seen: { error?: Error; msa?: string } = {};
    app.use(observe(seen));

    await app.handle(toBytes(SAMPLE_ACK));
    expect(seen.error).toBeUndefined();
  });

  it("replies AE echoing MSH-10, running no middleware and no route, when the parser throws", async () => {
    const thrown = new Error("parser failed");
    const seen: Error[] = [];
    const ran: string[] = [];
    const app = new Mllp()
      .parser(unified().use(throwingParser(thrown)))
      .onError((raised) => {
        seen.push(raised);
      });
    app.use(async (_ctx, next) => {
      ran.push("global");
      await next();
    });
    app.on("*", (ctx) => {
      ran.push("handler");
      return ctx.reply(RESPONSE_OK);
    });

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AE|MSG001");
    expect(seen).toEqual([thrown]);
    expect(ran).toEqual([]);
  });

  it("replies with the code of an AckException the parser throws", async () => {
    const app = new Mllp().parser(
      unified().use(
        throwingParser(new AckApplicationReject("Unreadable message", {}))
      )
    );

    const response = await app.handle(toBytes(SAMPLE_ADT));
    expect(text(response)?.split("\r")[1]).toBe("MSA|AR|MSG001");
  });
});

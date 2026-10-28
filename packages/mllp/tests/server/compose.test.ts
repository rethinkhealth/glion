// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { VFile } from "vfile";

import { compose } from "../../src/server/compose";
import { createContext } from "../../src/server/context";
import type { MllpRequest } from "../../src/server/request";
import { toResponse } from "../../src/server/response";
import type { MllpResponse } from "../../src/server/response";
import type { Context, Middleware } from "../../src/server/types";

const SAMPLE_MESSAGE = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|CTL1|P|2.5.1";

/** `raw` as the app reads it, parsed with `parseHL7v2`. */
function request(raw: string): MllpRequest {
  const file = new VFile(raw);
  return { file, raw, tree: parseHL7v2.parse(file) };
}

function makeCtx(): Context {
  return createContext({
    app: { serializer: toHl7v2 },
    env: undefined,
    processor: parseHL7v2,
    request: request(SAMPLE_MESSAGE),
  });
}

const reply = (message: string): MllpResponse =>
  toResponse(parseHL7v2.parse(message), toHl7v2);
const text = (value: MllpResponse | undefined) =>
  value ? new TextDecoder().decode(value.bytes) : undefined;

function noAnswer(): undefined {
  return undefined;
}

describe("compose", () => {
  it("executes middleware in order", async () => {
    const order: number[] = [];
    const mw1: Middleware = async (_ctx, next) => {
      order.push(1);
      await next();
      order.push(4);
    };
    const mw2: Middleware = async (_ctx, next) => {
      order.push(2);
      await next();
      order.push(3);
    };

    await compose([mw1, mw2], noAnswer)(makeCtx());
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("captures response from middleware return value on ctx.res", async () => {
    const mw: Middleware = async () =>
      reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1");

    const ctx = makeCtx();
    await compose([mw], noAnswer)(ctx);
    expect(ctx.res).toBeDefined();
    expect(text(ctx.res)).toContain("MSA|AA");
  });

  it("short-circuits when middleware returns without calling next", async () => {
    const order: number[] = [];
    const mw1: Middleware = async () => {
      order.push(1);
      return reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Answered");
    };
    const mw2: Middleware = async (_ctx, next) => {
      order.push(2);
      await next();
    };

    const ctx = makeCtx();
    await compose([mw1, mw2], noAnswer)(ctx);
    expect(order).toEqual([1]);
    expect(text(ctx.res)).toContain("Answered");
  });

  it("writes the response onError gives a thrown error, and next() resolves for the outer middleware", async () => {
    const thrown = new Error("boom");
    const seen: Error[] = [];
    let outerSaw: string | undefined;
    const outer: Middleware = async (ctx, next) => {
      await next();
      outerSaw = text(ctx.res);
    };
    const inner: Middleware = async () => {
      throw thrown;
    };

    const ctx = makeCtx();
    await compose([outer, inner], (error) => {
      seen.push(error);
      return reply("MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1");
    })(ctx);
    expect(seen).toEqual([thrown]);
    expect(outerSaw).toContain("MSA|AE");
    expect(text(ctx.res)).toContain("MSA|AE");
  });

  it("passes NEXT_CALLED_TWICE to onError and throws it to the second next() call", async () => {
    const seen: Error[] = [];
    let caught: unknown;
    const twice: Middleware = async (_ctx, next) => {
      await next();
      try {
        await next();
      } catch (error) {
        caught = error;
      }
    };

    const record = (error: Error): undefined => {
      seen.push(error);
    };

    await compose([twice], record)(makeCtx());
    expect(seen).toHaveLength(1);
    expect(caught).toBe(seen[0]);
    expect((caught as { code?: string }).code).toBe("NEXT_CALLED_TWICE");
  });

  it("replaces a returned reply with the NAK of a middleware outside it that throws", async () => {
    const nak = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1");
    const outer: Middleware = async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    };
    const ctx = makeCtx();

    await compose(
      [outer, () => reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1")],
      () => nak
    )(ctx);
    expect(ctx.res).toBe(nak);
  });

  it("writes the NAK of the latest error when two middleware throw", async () => {
    const outer: Middleware = async (_ctx, next) => {
      await next();
      throw new Error("second");
    };
    const inner: Middleware = () => {
      throw new Error("first");
    };
    const ctx = makeCtx();

    await compose([outer, inner], (error) =>
      reply(`MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1|${error.message}`)
    )(ctx);
    expect(text(ctx.res)).toContain("MSA|AE|CTL1|second");
  });

  it("clears the response when a middleware returns null", async () => {
    const outer: Middleware = async (_ctx, next) => {
      await next();
      return null;
    };
    const ctx = makeCtx();

    await compose(
      [outer, () => reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1")],
      noAnswer
    )(ctx);
    expect(ctx.res).toBeUndefined();
  });

  it("replaces a response written to ctx.res when a middleware outside it throws", async () => {
    const nak = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1");
    const outer: Middleware = async (_ctx, next) => {
      await next();
      throw new Error("audit write failed");
    };
    const inner: Middleware = (ctx) => {
      ctx.res = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1");
    };
    const ctx = makeCtx();

    await compose([outer, inner], () => nak)(ctx);
    expect(ctx.res).toBe(nak);
  });

  it("works with empty middleware array", async () => {
    const ctx = makeCtx();
    await compose([], noAnswer)(ctx);
    expect(ctx.res).toBeUndefined();
  });

  it("supports async middleware", async () => {
    const mw: Middleware = async (ctx, next) => {
      ctx.set("before", true);
      await next();
      ctx.set("after", true);
    };
    const handler: Middleware = async (ctx) => {
      expect(ctx.get("before")).toBe(true);
      return reply(`MSH|^~\\&||||||||||2.5.1\rMSA|AA|${ctx.controlId}`);
    };

    const ctx = makeCtx();
    await compose([mw, handler], noAnswer)(ctx);
    expect(ctx.get("after")).toBe(true);
    expect(text(ctx.res)).toContain("MSA|AA");
  });

  it("allows middleware to set ctx.res directly", async () => {
    const mw: Middleware = async (ctx, next) => {
      await next();
      ctx.res = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Direct");
    };

    const ctx = makeCtx();
    await compose([mw], noAnswer)(ctx);
    expect(text(ctx.res)).toContain("Direct");
  });

  it("last write to ctx.res wins", async () => {
    const inner: Middleware = async (ctx) => {
      ctx.res = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Inner");
    };
    const outer: Middleware = async (ctx, next) => {
      await next();
      ctx.res = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Outer");
    };

    const ctx = makeCtx();
    await compose([outer, inner], noAnswer)(ctx);
    expect(text(ctx.res)).toContain("Outer");
  });
});

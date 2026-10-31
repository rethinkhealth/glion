// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { compose } from "../../src/server/compose";
import { createContext } from "../../src/server/context";
import { parseRequest } from "../../src/server/request";
import type { Context, Middleware, Response } from "../../src/server/types";

const SAMPLE_MESSAGE = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|CTL1|P|2.5.1";

async function makeCtx(): Promise<Context> {
  return createContext({
    env: undefined,
    request: await parseRequest(
      new TextEncoder().encode(SAMPLE_MESSAGE),
      parseHL7v2
    ),
  });
}

const reply = (raw: string): Response => ({ raw });
const text = (value: Response | undefined) => value?.raw;

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

    await compose([mw1, mw2], noAnswer)(await makeCtx());
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("captures response from middleware return value on ctx.res", async () => {
    const mw: Middleware = async () =>
      reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1");

    const ctx = await makeCtx();
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

    const ctx = await makeCtx();
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

    const ctx = await makeCtx();
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

    await compose([twice], record)(await makeCtx());
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
    const ctx = await makeCtx();

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
    const ctx = await makeCtx();

    await compose([outer, inner], (error) =>
      reply(`MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1|${error.message}`)
    )(ctx);
    expect(text(ctx.res)).toContain("MSA|AE|CTL1|second");
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
    const ctx = await makeCtx();

    await compose([outer, inner], () => nak)(ctx);
    expect(ctx.res).toBe(nak);
  });

  it("works with empty middleware array", async () => {
    const ctx = await makeCtx();
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
      return reply(
        `MSH|^~\\&||||||||||2.5.1\rMSA|AA|${ctx.req.header.controlId}`
      );
    };

    const ctx = await makeCtx();
    await compose([mw, handler], noAnswer)(ctx);
    expect(ctx.get("after")).toBe(true);
    expect(text(ctx.res)).toContain("MSA|AA");
  });

  it("allows middleware to set ctx.res directly", async () => {
    const mw: Middleware = async (ctx, next) => {
      await next();
      ctx.res = reply("MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Direct");
    };

    const ctx = await makeCtx();
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

    const ctx = await makeCtx();
    await compose([outer, inner], noAnswer)(ctx);
    expect(text(ctx.res)).toContain("Outer");
  });
});

// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { compose } from "../../src/server/compose.js";
import { createContext } from "../../src/server/context.js";
import type { Context, Middleware } from "../../src/server/types.js";

const SAMPLE_MESSAGE = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|CTL1|P|2.5.1";

function makeCtx(): Context {
  return createContext({
    bytes: new TextEncoder().encode(SAMPLE_MESSAGE),
    connection: {
      id: 1,
      localPort: 2575,
      remoteAddress: "127.0.0.1",
      remotePort: 12_345,
      secure: false,
      state: new Map(),
    },
    processor: parseHL7v2,
    raw: SAMPLE_MESSAGE,
  });
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

    await compose([mw1, mw2])(makeCtx());
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("captures response from middleware return value on ctx.res", async () => {
    const mw: Middleware = async () => ({
      raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1",
    });

    const ctx = makeCtx();
    await compose([mw])(ctx);
    expect(ctx.res).toBeDefined();
    expect(ctx.res?.raw).toContain("MSA|AA");
  });

  it("short-circuits when middleware returns without calling next", async () => {
    const order: number[] = [];
    const mw1: Middleware = async () => {
      order.push(1);
      return { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AR|CTL1|Blocked" };
    };
    const mw2: Middleware = async (_ctx, next) => {
      order.push(2);
      await next();
    };

    const ctx = makeCtx();
    await compose([mw1, mw2])(ctx);
    expect(order).toEqual([1]);
    expect(ctx.res?.raw).toContain("MSA|AR");
  });

  it("propagates errors thrown by middleware", async () => {
    const mw: Middleware = async () => {
      throw new Error("boom");
    };

    await expect(compose([mw])(makeCtx())).rejects.toThrow("boom");
  });

  it("throws if next() is called multiple times", async () => {
    const mw: Middleware = async (_ctx, next) => {
      await next();
      await next();
    };

    await expect(compose([mw])(makeCtx())).rejects.toThrow(
      "next() called multiple times"
    );
  });

  it("works with empty middleware array", async () => {
    const ctx = makeCtx();
    await compose([])(ctx);
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
      return { raw: `MSH|^~\\&||||||||||2.5.1\rMSA|AA|${ctx.controlId}` };
    };

    const ctx = makeCtx();
    await compose([mw, handler])(ctx);
    expect(ctx.get("after")).toBe(true);
    expect(ctx.res?.raw).toContain("MSA|AA");
  });

  it("allows middleware to set ctx.res directly", async () => {
    const mw: Middleware = async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Direct" };
    };

    const ctx = makeCtx();
    await compose([mw])(ctx);
    expect(ctx.res?.raw).toContain("Direct");
  });

  it("last write to ctx.res wins", async () => {
    const inner: Middleware = async (ctx) => {
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Inner" };
    };
    const outer: Middleware = async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Outer" };
    };

    const ctx = makeCtx();
    await compose([outer, inner])(ctx);
    expect(ctx.res?.raw).toContain("Outer");
  });
});

// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { compose } from "../../src/server/compose";
import { createContext } from "../../src/server/context";
import type { Context, Middleware } from "../../src/server/types";

const SAMPLE_MESSAGE = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|CTL1|P|2.5.1";

function makeCtx(): Context {
  return createContext({
    connection: {
      id: 1,
      localPort: 2575,
      remoteAddress: "127.0.0.1",
      remotePort: 12_345,
      secure: false,
      state: new Map(),
    },
    payload: new TextEncoder().encode(SAMPLE_MESSAGE),
    processor: parseHL7v2,
  });
}

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
    const mw: Middleware = async () => ({
      raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1",
    });

    const ctx = makeCtx();
    await compose([mw], noAnswer)(ctx);
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
    await compose([mw1, mw2], noAnswer)(ctx);
    expect(order).toEqual([1]);
    expect(ctx.res?.raw).toContain("MSA|AR");
  });

  it("writes the response onError gives a thrown error, and next() resolves for the outer middleware", async () => {
    const thrown = new Error("boom");
    const seen: Error[] = [];
    let outerSaw: string | undefined;
    const outer: Middleware = async (ctx, next) => {
      await next();
      outerSaw = ctx.res?.raw;
    };
    const inner: Middleware = async () => {
      throw thrown;
    };

    const ctx = makeCtx();
    await compose([outer, inner], (error) => {
      seen.push(error);
      return { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AE|CTL1" };
    })(ctx);
    expect(seen).toEqual([thrown]);
    expect(outerSaw).toContain("MSA|AE");
    expect(ctx.res?.raw).toContain("MSA|AE");
  });

  it("rejects with the error of a next() called a second time, once the chain has run", async () => {
    const ran: string[] = [];
    const outer: Middleware = async (_ctx, next) => {
      await next();
      ran.push("outer");
    };
    const twice: Middleware = async (_ctx, next) => {
      await next();
      await next();
    };

    await expect(compose([outer, twice], noAnswer)(makeCtx())).rejects.toThrow(
      "next() called multiple times"
    );
    expect(ran).toEqual(["outer"]);
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
      return { raw: `MSH|^~\\&||||||||||2.5.1\rMSA|AA|${ctx.controlId}` };
    };

    const ctx = makeCtx();
    await compose([mw, handler], noAnswer)(ctx);
    expect(ctx.get("after")).toBe(true);
    expect(ctx.res?.raw).toContain("MSA|AA");
  });

  it("allows middleware to set ctx.res directly", async () => {
    const mw: Middleware = async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|CTL1|Direct" };
    };

    const ctx = makeCtx();
    await compose([mw], noAnswer)(ctx);
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
    await compose([outer, inner], noAnswer)(ctx);
    expect(ctx.res?.raw).toContain("Outer");
  });
});

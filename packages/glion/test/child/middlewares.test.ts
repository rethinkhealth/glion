// oxlint-disable require-await, no-empty-function
import type { Context, Middleware } from "@glion/mllp";
import { describe, expect, it } from "vitest";

import { createMsgTelemetry } from "../../src/child/middlewares.js";
import type { PartialEvent } from "../../src/events.js";

/**
 * Minimal context stub for middleware tests.
 * Only the fields read by createMsgTelemetry are needed.
 */
function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    connection: {
      id: 1,
      localPort: 2575,
      remoteAddress: "127.0.0.1",
      remotePort: 41_376,
      secure: false,
      state: new Map(),
    },
    controlId: "MSG001",
    messageType: "ADT",
    res: undefined,
    triggerEvent: "A01",
    ...overrides,
  } as Context;
}

describe("createMsgTelemetry", () => {
  it("emits a msg event with timing and routing info", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {});

    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.t).toBe("msg");
    expect(event.trigger).toBe("ADT^A01");
    expect(event.control).toBe("MSG001");
    expect(event.remote).toBe("127.0.0.1:41376");
    expect(event.ms).toBeGreaterThanOrEqual(0);
  });

  it("reports ack=null when ctx.res is undefined", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {});

    const event = events[0] as Record<string, unknown>;
    expect(event.ack).toBeNull();
  });

  it("extracts AA ack code from ctx.res.raw", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.res = {
        raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001",
      };
    });

    const event = events[0] as Record<string, unknown>;
    expect(event.ack).toBe("AA");
  });

  it("extracts AE ack code from ctx.res.raw", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.res = {
        raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AE|MSG001|Error",
      };
    });

    const event = events[0] as Record<string, unknown>;
    expect(event.ack).toBe("AE");
  });

  it("extracts AR ack code from ctx.res.raw", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.res = {
        raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AR|MSG001|Rejected",
      };
    });

    const event = events[0] as Record<string, unknown>;
    expect(event.ack).toBe("AR");
  });

  it("reports ack=null when res.raw has no MSA segment", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rPID|1||12345" };
    });

    const event = events[0] as Record<string, unknown>;
    expect(event.ack).toBeNull();
  });

  it("uses ? for missing messageType/triggerEvent", async () => {
    const events: PartialEvent[] = [];
    const mw = createMsgTelemetry((e) => events.push(e));

    const ctx = makeCtx({
      messageType: undefined as unknown as string,
      triggerEvent: undefined as unknown as string,
    });
    await mw(ctx, async () => {});

    const event = events[0] as Record<string, unknown>;
    expect(event.trigger).toBe("?^?");
  });

  describe("middleware ordering interaction", () => {
    /**
     * This test reproduces the bug where telemetry middleware installed
     * AFTER (inner to) ack middleware cannot see ctx.res because ack
     * middleware sets it in its post-next() phase, which runs after
     * the inner telemetry has already captured the response.
     *
     * Onion model:
     * ackMiddleware (outer)
     * → telemetry (inner)
     * → handler
     * ← telemetry reads ctx.res → undefined → ack=null → "?"
     * ← ackMiddleware sets ctx.res (too late)
     */
    it("inner telemetry misses ctx.res set by outer ack middleware (the bug)", async () => {
      const events: PartialEvent[] = [];
      const telemetry = createMsgTelemetry((e) => events.push(e));

      // Simulate ack middleware: sets ctx.res AFTER next()
      const ackMw: Middleware = async (ctx, next) => {
        await next();
        ctx.res = {
          raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001",
        };
      };

      const ctx = makeCtx();
      // Chain: ackMw (outer) → telemetry (inner) → handler
      const handler = async () => {};
      const chain = async () => {
        await ackMw(ctx, async () => {
          await telemetry(ctx, handler);
        });
      };
      await chain();

      const event = events[0] as Record<string, unknown>;
      // Bug: telemetry reads ctx.res before ackMw sets it
      expect(event.ack).toBeNull();
    });

    /**
     * This test shows the fix: when telemetry is outermost (prepended),
     * it wraps ack middleware. Its await next() completes only after
     * ack middleware has set ctx.res, so the ACK code is captured.
     *
     * Onion model:
     * telemetry (outer)
     * → ackMiddleware (inner)
     * → handler
     * ← ackMiddleware sets ctx.res
     * ← telemetry reads ctx.res → "MSA|AA|..." → ack="AA"
     */
    it("outer telemetry captures ctx.res set by inner ack middleware (the fix)", async () => {
      const events: PartialEvent[] = [];
      const telemetry = createMsgTelemetry((e) => events.push(e));

      // Simulate ack middleware: sets ctx.res AFTER next()
      const ackMw: Middleware = async (ctx, next) => {
        await next();
        ctx.res = {
          raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001",
        };
      };

      const ctx = makeCtx();
      // Chain: telemetry (outer) → ackMw (inner) → handler
      const handler = async () => {};
      const chain = async () => {
        await telemetry(ctx, async () => {
          await ackMw(ctx, handler);
        });
      };
      await chain();

      const event = events[0] as Record<string, unknown>;
      // Fix: telemetry reads ctx.res after ackMw sets it
      expect(event.ack).toBe("AA");
    });

    it("outer telemetry captures error ACK codes too", async () => {
      const events: PartialEvent[] = [];
      const telemetry = createMsgTelemetry((e) => events.push(e));

      const ackMw: Middleware = async (ctx, next) => {
        await next();
        ctx.res = {
          raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AE|MSG001|ApplicationError",
        };
      };

      const ctx = makeCtx();
      await telemetry(ctx, async () => {
        await ackMw(ctx, async () => {});
      });

      const event = events[0] as Record<string, unknown>;
      expect(event.ack).toBe("AE");
    });
  });
});

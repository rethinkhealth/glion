// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { Mllp } from "../../src/server/mllp.js";
import type { ConnectionInfo } from "../../src/server/types.js";

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

function createApp() {
  return new Mllp().parser(parseHL7v2);
}

describe("Mllp.use({ prepend })", () => {
  it("appends middleware by default", async () => {
    const order: string[] = [];
    const app = createApp();

    app.use(async (_ctx, next) => {
      order.push("first");
      await next();
    });
    app.use(async (_ctx, next) => {
      order.push("second");
      await next();
    });
    app.on("*", async () => {
      order.push("handler");
    });

    await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(order).toEqual(["first", "second", "handler"]);
  });

  it("prepends middleware with { prepend: true }", async () => {
    const order: string[] = [];
    const app = createApp();

    app.use(async (_ctx, next) => {
      order.push("first");
      await next();
    });
    app.use(
      async (_ctx, next) => {
        order.push("prepended");
        await next();
      },
      { prepend: true }
    );
    app.on("*", async () => {
      order.push("handler");
    });

    await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(order).toEqual(["prepended", "first", "handler"]);
  });

  it("prepended middleware sees ctx.res set by later (inner) middleware", async () => {
    const app = createApp();
    let capturedRes: string | undefined;

    // Register an inner middleware that sets ctx.res (simulates ackMiddleware)
    app.use(async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };
    });

    // Prepend an outer middleware that reads ctx.res after next() (simulates telemetry)
    app.use(
      async (ctx, next) => {
        await next();
        capturedRes = ctx.res?.raw;
      },
      { prepend: true }
    );

    app.on("*", async () => {
      // handler does nothing
    });

    await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(capturedRes).toContain("MSA|AA");
  });

  it("non-prepended middleware does NOT see ctx.res set by outer middleware", async () => {
    const app = createApp();
    let capturedRes: string | undefined;

    // Register outer middleware that sets ctx.res after next()
    app.use(async (ctx, next) => {
      await next();
      ctx.res = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };
    });

    // Append inner middleware (default) that reads ctx.res after next()
    // This runs INSIDE the outer middleware, so it finishes BEFORE outer sets ctx.res
    app.use(async (ctx, next) => {
      await next();
      capturedRes = ctx.res?.raw;
    });

    app.on("*", async () => {
      // handler does nothing
    });

    await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    // Inner middleware finishes before outer sets ctx.res → undefined
    expect(capturedRes).toBeUndefined();
  });

  it("scoped middleware still works alongside prepend", async () => {
    const order: string[] = [];
    const app = createApp();

    app.use(async (_ctx, next) => {
      order.push("global");
      await next();
    });
    app.use("ADT^*", async (_ctx, next) => {
      order.push("scoped");
      await next();
    });
    app.use(
      async (_ctx, next) => {
        order.push("prepended");
        await next();
      },
      { prepend: true }
    );
    app.on("*", async () => {
      order.push("handler");
    });

    await app.handle(SAMPLE_ADT, toBytes(SAMPLE_ADT), MOCK_CONNECTION);
    expect(order).toEqual(["prepended", "global", "scoped", "handler"]);
  });

  it("returns this for fluent chaining", () => {
    const app = new Mllp();
    const result = app.use(async (_ctx, next) => next(), { prepend: true });
    expect(result).toBe(app);
  });
});

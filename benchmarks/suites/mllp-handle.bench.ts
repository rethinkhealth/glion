/**
 * MLLP handle() benchmarks — routing and middleware overhead.
 *
 * Calls `app.handle()` directly — no TCP, no MLLP framing. This isolates
 * the cost of parsing, routing, middleware composition, and context
 * creation, and is the deterministic stand-in for server-side overhead
 * (real-socket timing is outside what CodSpeed's instruction counting
 * can measure).
 */
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { Middleware } from "@glion/mllp";
import { bench, describe } from "vitest";

import { ORU_R01_LARGE, ADT_A01_MINIMAL } from "../fixtures/messages";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESPONSE_OK = parseHL7v2.parse("MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001");

const textEncoder = new TextEncoder();
const smallBytes = textEncoder.encode(ADT_A01_MINIMAL);
const largeBytes = textEncoder.encode(ORU_R01_LARGE);

// oxlint-disable-next-line require-await
const noop: Middleware = async (_ctx, next) => next();

function withMiddleware(count: number): Mllp {
  const app = new Mllp();
  for (let i = 0; i < count; i++) {
    app.use(noop);
  }
  app.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OK));
  return app;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("mllp", () => {
  const app = new Mllp();
  app.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OK));
  app.on("ORU^R01", (ctx) => ctx.reply(RESPONSE_OK));

  bench("mllp: handle small message (3 segments)", async () => {
    await app.handle(smallBytes);
  });

  bench("mllp: handle large message (100+ segments)", async () => {
    await app.handle(largeBytes);
  });

  const appAck = new Mllp();
  appAck.on("ADT^A01", (ctx) => ctx.ack());

  bench("mllp: handle with ctx.ack() reply (AA)", async () => {
    await appAck.handle(smallBytes);
  });

  const appMulti = new Mllp();
  appMulti.on("ORU^R01", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("ORM^O01", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("SIU^S12", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("MDM^T02", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("ADT^A01", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("ADT^A08", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("ADT^A04", (ctx) => ctx.reply(RESPONSE_OK));
  appMulti.on("*", (ctx) => ctx.reply(RESPONSE_OK));

  bench("mllp: handle 8 routes (match 5th)", async () => {
    await appMulti.handle(smallBytes);
  });

  const app5 = withMiddleware(5);
  const app10 = withMiddleware(10);

  bench("mllp: handle with 5 middleware", async () => {
    await app5.handle(smallBytes);
  });

  bench("mllp: handle with 10 middleware", async () => {
    await app10.handle(smallBytes);
  });

  const appTree = new Mllp();
  appTree.on("ADT^A01", async (ctx) => {
    await ctx.tree();
    return ctx.reply(RESPONSE_OK);
  });

  bench("mllp: handle with handler awaiting tree()", async () => {
    await appTree.handle(smallBytes);
  });

  const appNoMatch = new Mllp();
  appNoMatch.on("ORM^O01", (ctx) => ctx.reply(RESPONSE_OK));

  bench("mllp: handle no matching route (AR reply)", async () => {
    await appNoMatch.handle(smallBytes);
  });

  const appError = new Mllp();
  appError.on("ADT^A01", () => {
    throw new Error("handler error");
  });

  bench("mllp: handle handler throws (AE reply)", async () => {
    await appError.handle(smallBytes);
  });
});

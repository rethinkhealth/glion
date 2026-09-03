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
import type { ConnectionInfo, Middleware } from "@glion/mllp";
import { bench, describe } from "vitest";

import { ORU_R01_LARGE, ADT_A01_MINIMAL } from "../fixtures/messages";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONNECTION: ConnectionInfo = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
  state: new Map(),
};

const RESPONSE_OK = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };

const textEncoder = new TextEncoder();
const smallBytes = textEncoder.encode(ADT_A01_MINIMAL);
const largeBytes = textEncoder.encode(ORU_R01_LARGE);

// oxlint-disable-next-line require-await
const noop: Middleware = async (_ctx, next) => next();

function withMiddleware(count: number): Mllp {
  const app = new Mllp().parser(parseHL7v2);
  for (let i = 0; i < count; i++) {
    app.use(noop);
  }
  app.on("ADT^A01", () => RESPONSE_OK);
  return app;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("mllp", () => {
  const app = new Mllp().parser(parseHL7v2);
  app.on("ADT^A01", () => RESPONSE_OK);
  app.on("ORU^R01", () => RESPONSE_OK);

  bench("mllp: handle small message (3 segments)", async () => {
    await app.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  bench("mllp: handle large message (100+ segments)", async () => {
    await app.handle(ORU_R01_LARGE, largeBytes, MOCK_CONNECTION);
  });

  const appMulti = new Mllp().parser(parseHL7v2);
  appMulti.on("ORU^R01", () => RESPONSE_OK);
  appMulti.on("ORM^O01", () => RESPONSE_OK);
  appMulti.on("SIU^S12", () => RESPONSE_OK);
  appMulti.on("MDM^T02", () => RESPONSE_OK);
  appMulti.on("ADT^A01", () => RESPONSE_OK);
  appMulti.on("ADT^A08", () => RESPONSE_OK);
  appMulti.on("ADT^A04", () => RESPONSE_OK);
  appMulti.on("*", () => RESPONSE_OK);

  bench("mllp: handle 8 routes (match 5th)", async () => {
    await appMulti.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  const app5 = withMiddleware(5);
  const app10 = withMiddleware(10);

  bench("mllp: handle with 5 middleware", async () => {
    await app5.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  bench("mllp: handle with 10 middleware", async () => {
    await app10.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  const appTree = new Mllp().parser(parseHL7v2);
  appTree.on("ADT^A01", async (ctx) => {
    await ctx.tree();
    return RESPONSE_OK;
  });

  bench("mllp: handle with handler awaiting tree()", async () => {
    await appTree.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  const appNoMatch = new Mllp().parser(parseHL7v2);
  appNoMatch.on("ORM^O01", () => RESPONSE_OK);

  bench("mllp: handle no matching route", async () => {
    await appNoMatch.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });

  const appError = new Mllp().parser(parseHL7v2);
  appError.on("ADT^A01", () => {
    throw new Error("handler error");
  });
  appError.onError(() => RESPONSE_OK);

  bench("mllp: handle handler throws, onError recovers", async () => {
    await appError.handle(ADT_A01_MINIMAL, smallBytes, MOCK_CONNECTION);
  });
});

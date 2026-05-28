/**
 * Micro-benchmarks for the Mllp routing and middleware engine.
 *
 * These benchmarks call `app.handle()` directly — no TCP, no MLLP framing.
 * They isolate the cost of parsing, routing, middleware composition, and
 * context creation.
 *
 * Run: pnpm bench
 */
import { parseHL7v2 } from "@glion/hl7v2";
import { bench, describe } from "vitest";

import { Mllp } from "../src/server/mllp";
import type { ConnectionInfo, Middleware } from "../src/server/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMALL_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const LARGE_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q^^^^L||19800101|M|||123 Main St^^Springfield^IL^62704^USA",
  ...Array.from({ length: 50 }, (_, i) => [
    `OBR|${i + 1}||LAB${String(i).padStart(4, "0")}|CBC^Complete Blood Count`,
    `OBX|1|NM|WBC^White Blood Cell Count||${(5 + Math.random() * 10).toFixed(1)}|10*9/L|4.5-11.0|N|||F`,
    `OBX|2|NM|RBC^Red Blood Cell Count||${(4 + Math.random() * 2).toFixed(2)}|10*12/L|4.0-5.5|N|||F`,
    `OBX|3|NM|HGB^Hemoglobin||${(12 + Math.random() * 4).toFixed(1)}|g/dL|12.0-16.0|N|||F`,
    `OBX|4|NM|PLT^Platelet Count||${Math.floor(150 + Math.random() * 200)}|10*9/L|150-400|N|||F`,
  ]).flat(),
].join("\r");

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

function toBytes(msg: string): Uint8Array {
  return textEncoder.encode(msg);
}

const smallBytes = toBytes(SMALL_MESSAGE);
const largeBytes = toBytes(LARGE_MESSAGE);

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("handle() — routing", () => {
  const appSingle = new Mllp().parser(parseHL7v2);
  appSingle.on("ADT^A01", () => RESPONSE_OK);

  const appMulti = new Mllp().parser(parseHL7v2);
  appMulti.on("ORU^R01", () => RESPONSE_OK);
  appMulti.on("ORM^O01", () => RESPONSE_OK);
  appMulti.on("SIU^S12", () => RESPONSE_OK);
  appMulti.on("MDM^T02", () => RESPONSE_OK);
  appMulti.on("ADT^A01", () => RESPONSE_OK);
  appMulti.on("ADT^A08", () => RESPONSE_OK);
  appMulti.on("ADT^A04", () => RESPONSE_OK);
  appMulti.on("*", () => RESPONSE_OK);

  bench("single route, small message", async () => {
    await appSingle.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("8 routes (match 5th), small message", async () => {
    await appMulti.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("single route, large message (200+ segments)", async () => {
    await appSingle.handle(LARGE_MESSAGE, largeBytes, MOCK_CONNECTION);
  });
});

describe("handle() — middleware", () => {
  // oxlint-disable-next-line require-await
  const noop: Middleware = async (_ctx, next) => next();

  const app1 = new Mllp().parser(parseHL7v2);
  app1.use(noop);
  app1.on("ADT^A01", () => RESPONSE_OK);

  const app5 = new Mllp().parser(parseHL7v2);
  for (let i = 0; i < 5; i++) {
    app5.use(noop);
  }
  app5.on("ADT^A01", () => RESPONSE_OK);

  const app10 = new Mllp().parser(parseHL7v2);
  for (let i = 0; i < 10; i++) {
    app10.use(noop);
  }
  app10.on("ADT^A01", () => RESPONSE_OK);

  bench("1 middleware", async () => {
    await app1.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("5 middleware", async () => {
    await app5.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("10 middleware", async () => {
    await app10.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });
});

describe("handle() — handler awaits tree()", () => {
  const appTree = new Mllp().parser(parseHL7v2);
  appTree.on("ADT^A01", async (ctx) => {
    await ctx.tree();
    return RESPONSE_OK;
  });

  const appTreeLarge = new Mllp().parser(parseHL7v2);
  appTreeLarge.on("ORU^R01", async (ctx) => {
    await ctx.tree();
    return RESPONSE_OK;
  });

  const appResult = new Mllp().parser(parseHL7v2);
  appResult.on("ADT^A01", async (ctx) => {
    await ctx.result();
    return RESPONSE_OK;
  });

  bench("tree(), small message", async () => {
    await appTree.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("tree(), large message (200+ segments)", async () => {
    await appTreeLarge.handle(LARGE_MESSAGE, largeBytes, MOCK_CONNECTION);
  });

  bench("result(), small message (tree + compile)", async () => {
    await appResult.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });
});

describe("handle() — no match", () => {
  const app = new Mllp().parser(parseHL7v2);
  app.on("ORM^O01", () => RESPONSE_OK);

  bench("no matching route", async () => {
    await app.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });
});

describe("handle() — error path", () => {
  const app = new Mllp().parser(parseHL7v2);
  app.on("ADT^A01", () => {
    throw new Error("handler error");
  });
  app.onError(() => RESPONSE_OK);

  bench("handler throws, onError recovers", async () => {
    await app.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });
});

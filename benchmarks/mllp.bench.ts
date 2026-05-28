/**
 * MLLP handle() benchmarks — measures routing and middleware overhead.
 *
 * Tests the application-level message handling without TCP networking.
 * This isolates the cost of routing, middleware composition,
 * and context creation.
 */
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { ConnectionInfo, Middleware } from "@glion/mllp";
import { bench, describe } from "vitest";

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
  ]).flat(),
].join("\r");

const MOCK_CONNECTION: ConnectionInfo = {
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
};

const RESPONSE_OK = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };

const textEncoder = new TextEncoder();
const smallBytes = textEncoder.encode(SMALL_MESSAGE);
const largeBytes = textEncoder.encode(LARGE_MESSAGE);

// oxlint-disable-next-line require-await
const noop: Middleware = async (_ctx, next) => next();

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("mllp", () => {
  const app = new Mllp().parser(parseHL7v2);
  app.on("ADT^A01", () => RESPONSE_OK);

  bench("mllp: handle small message (3 segments)", async () => {
    await app.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("mllp: handle large message (100+ segments)", async () => {
    await app.handle(LARGE_MESSAGE, largeBytes, MOCK_CONNECTION);
  });

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

  bench("mllp: handle with 5 middleware", async () => {
    await app5.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });

  bench("mllp: handle with 10 middleware", async () => {
    await app10.handle(SMALL_MESSAGE, smallBytes, MOCK_CONNECTION);
  });
});

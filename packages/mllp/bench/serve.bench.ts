// oxlint-disable require-await
// oxlint-disable promise/avoid-new
/**
 * TCP benchmarks for the full MLLP stack.
 *
 * These benchmarks send real MLLP-framed messages over TCP to a running
 * `serve()` instance. They measure the complete path: TCP -> decode ->
 * middleware -> handler -> encode -> TCP.
 *
 * Run: pnpm bench
 */
import net from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import { afterAll, bench, beforeAll, describe } from "vitest";

import { serve } from "../src/node/serve";
import type { Server } from "../src/node/serve";
import { Mllp } from "../src/server/mllp";
import { MLLP_END_BYTE_1, MLLP_END_BYTE_2 } from "../src/transport/constants";
import { encode } from "../src/transport/encoder";

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

const RESPONSE_OK = { raw: "MSH|^~\\&||||||||||2.5.1\rMSA|AA|MSG001" };

const smallFrame = encode(SMALL_MESSAGE);
const largeFrame = encode(LARGE_MESSAGE);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendAndReceive(
  client: net.Socket,
  frame: Uint8Array
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      if (
        combined.length >= 3 &&
        combined.at(-2) === MLLP_END_BYTE_1 &&
        combined.at(-1) === MLLP_END_BYTE_2
      ) {
        client.removeListener("data", onData);
        client.removeListener("error", onError);
        resolve(combined);
      }
    };

    const onError = (err: Error) => {
      client.removeListener("data", onData);
      client.removeListener("error", onError);
      reject(err);
    };

    client.on("data", onData);
    client.on("error", onError);
    client.write(frame);
  });
}

function createClient(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: "127.0.0.1", port }, () => {
      resolve(client);
    });
    client.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Shared state — initialized in beforeAll
// ---------------------------------------------------------------------------

const CONNECTION_COUNT = 10;

const servers: Server[] = [];
const clients: net.Socket[] = [];

let singleClient: net.Socket;
let largeClient: net.Socket;
let burstClient: net.Socket;
let noMwClient: net.Socket;
let mwClient: net.Socket;
const concurrentClients: net.Socket[] = [];

beforeAll(async () => {
  // Plain server (no middleware)
  const plainApp = new Mllp().parser(parseHL7v2);
  plainApp.on("*", () => RESPONSE_OK);
  const plainServer = serve(plainApp, { port: 0 });
  servers.push(plainServer);

  // Server with 5 noop middleware
  const mwApp = new Mllp().parser(parseHL7v2);
  for (let i = 0; i < 5; i++) {
    mwApp.use(async (_ctx, next) => next());
  }
  mwApp.on("*", () => RESPONSE_OK);
  const mwServer = serve(mwApp, { port: 0 });
  servers.push(mwServer);

  // Connect all clients
  singleClient = await createClient(plainServer.port);
  clients.push(singleClient);

  largeClient = await createClient(plainServer.port);
  clients.push(largeClient);

  burstClient = await createClient(plainServer.port);
  clients.push(burstClient);

  noMwClient = await createClient(plainServer.port);
  clients.push(noMwClient);

  mwClient = await createClient(mwServer.port);
  clients.push(mwClient);

  for (let i = 0; i < CONNECTION_COUNT; i++) {
    const c = await createClient(plainServer.port);
    concurrentClients.push(c);
    clients.push(c);
  }
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  for (const c of clients) {
    c.destroy();
  }
  for (const s of servers) {
    await s.close();
  }
});

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("serve() — single connection", () => {
  bench("small message round-trip", async () => {
    await sendAndReceive(singleClient, smallFrame);
  });

  bench("large message round-trip (200+ segments)", async () => {
    await sendAndReceive(largeClient, largeFrame);
  });
});

describe("serve() — concurrent connections", () => {
  bench(`${CONNECTION_COUNT} connections in parallel`, async () => {
    await Promise.all(
      concurrentClients.map((client) => sendAndReceive(client, smallFrame))
    );
  });
});

describe("serve() — throughput burst", () => {
  bench("10 sequential messages on one connection", async () => {
    for (let i = 0; i < 10; i++) {
      await sendAndReceive(burstClient, smallFrame);
    }
  });
});

describe("serve() — middleware overhead", () => {
  bench("no middleware (baseline)", async () => {
    await sendAndReceive(noMwClient, smallFrame);
  });

  bench("5 noop middleware", async () => {
    await sendAndReceive(mwClient, smallFrame);
  });
});

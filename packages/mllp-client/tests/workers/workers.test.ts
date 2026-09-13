/**
 * The Cloudflare Workers runtime adapter, inside a real `workerd` spawned
 * through `wrangler`. The receivers stay in this process; the harness Worker
 * dials them over loopback.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

import type { HarnessOutcome, HarnessRequest } from "./harness";
import { acknowledgment, releasedPort, startReceiver } from "./receiver";

/** TEST-NET-1 (RFC 5737): never routed, so a SYN there is never answered. */
const BLACKHOLE = { host: "192.0.2.1", port: 65_535 };

const SHORT_TIMEOUT_MS = 300;
const SPLIT_DELAY_MS = 40;
/** Workerd resolves `close()` at once; nothing waits for the remote system. */
const CLOSE_BOUND_MS = 500;
const BOOT_MS = 60_000;

const ownerClosed = ["connect", "disconnect:null", "close"];

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev("./tests/workers/harness.ts", {
    config: "./tests/workers/wrangler.toml",
    experimental: { disableExperimentalWarning: true },
    local: true,
    logLevel: "warn",
  });
}, BOOT_MS);

afterAll(async () => {
  await worker?.stop();
});

async function run(body: HarnessRequest): Promise<HarnessOutcome> {
  const response = await worker.fetch("/", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return (await response.json()) as HarnessOutcome;
}

describe("workersSocket", () => {
  it("sends three messages on one connection", async () => {
    await using receiver = await startReceiver({
      onConnection: (socket) => {
        socket.on("data", (chunk: Buffer) => {
          socket.write(acknowledgment(chunk, "AA"));
        });
      },
    });

    const outcome = await run({ ...receiver, sends: 3 });

    expect(outcome.results.map((r) => r.code)).toEqual(["AA", "AA", "AA"]);
    expect(outcome).toMatchObject({
      events: ownerClosed,
      state: "closed",
      stateAfterRun: "connected",
    });
  });

  it("reads an acknowledgment split across two chunks", async () => {
    await using receiver = await startReceiver({
      onConnection: (socket) => {
        socket.on("data", (chunk: Buffer) => {
          const bytes = acknowledgment(chunk, "AA");
          const mid = Math.floor(bytes.length / 2);
          socket.write(bytes.subarray(0, mid));
          setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
        });
      },
    });

    const outcome = await run({ ...receiver });

    expect(outcome.results).toMatchObject([{ code: "AA" }]);
  });

  it("rejects SEND_TIMEOUT and closes when the receiver stays silent", async () => {
    await using receiver = await startReceiver();

    const outcome = await run({ ...receiver, sendTimeoutMs: SHORT_TIMEOUT_MS });

    expect(outcome.results).toMatchObject([
      { code: "SEND_TIMEOUT", error: "MllpSendTimeoutError" },
    ]);
    expect(outcome).toMatchObject({
      events: ["connect", "disconnect:SEND_TIMEOUT", "close"],
      stateAfterRun: "closed",
    });
  });

  it("rejects CONNECTION_LOST when the receiver drops after reading", async () => {
    await using receiver = await startReceiver({
      onConnection: (socket) => {
        socket.on("data", () => socket.destroy());
      },
    });

    const outcome = await run({ ...receiver });

    expect(outcome.results).toMatchObject([
      { code: "CONNECTION_LOST", error: "MllpConnectionLostError" },
    ]);
    expect(outcome.events).toEqual([
      "connect",
      "disconnect:CONNECTION_LOST",
      "close",
    ]);
  });

  it("reads the acknowledgment a one-shot receiver sends with its FIN", async () => {
    await using receiver = await startReceiver({
      onConnection: (socket) => {
        socket.on("data", (chunk: Buffer) => {
          if (!socket.writableEnded) {
            socket.end(acknowledgment(chunk, "AA"));
          }
        });
      },
    });

    const outcome = await run({ ...receiver, sends: 2 });

    expect(outcome.results).toMatchObject([
      { code: "AA" },
      { code: "CONNECTION_LOST" },
    ]);
  });

  it("rejects CONNECT_FAILED when nothing is listening", async () => {
    const outcome = await run(await releasedPort());

    expect(outcome.results).toMatchObject([
      { code: "CONNECT_FAILED", error: "MllpConnectFailedError" },
    ]);
    expect(outcome.events).toEqual(["close"]);
  });

  it("rejects CONNECT_TIMEOUT, in time, when the address never answers", async () => {
    const started = performance.now();
    const outcome = await run({
      ...BLACKHOLE,
      connectTimeoutMs: SHORT_TIMEOUT_MS,
    });

    expect(outcome.results).toMatchObject([
      { code: "CONNECT_TIMEOUT", error: "MllpConnectTimeoutError" },
    ]);
    expect(outcome.events).toEqual(["close"]);
    expect(performance.now() - started).toBeLessThan(SHORT_TIMEOUT_MS * 10);
  });

  it("rejects with the NAK and keeps the connection", async () => {
    await using receiver = await startReceiver({
      onConnection: (socket) => {
        let first = true;
        socket.on("data", (chunk: Buffer) => {
          socket.write(
            first
              ? acknowledgment(chunk, "AE", "Application error")
              : acknowledgment(chunk, "AA")
          );
          first = false;
        });
      },
    });

    const outcome = await run({ ...receiver, sends: 2 });

    expect(outcome.results).toMatchObject([
      { code: "AE", error: "AckApplicationError" },
      { code: "AA" },
    ]);
    expect(outcome).toMatchObject({
      events: ownerClosed,
      stateAfterRun: "connected",
    });
  });

  it("close() is bounded when the receiver never answers the FIN", async () => {
    await using receiver = await startReceiver({ allowHalfOpen: true });

    const outcome = await run({ ...receiver, connectOnly: true });

    expect(outcome.closeMs).toBeLessThan(CLOSE_BOUND_MS);
    expect(outcome).toMatchObject({ events: ownerClosed, state: "closed" });
  });
});

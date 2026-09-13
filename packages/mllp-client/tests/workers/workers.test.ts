/**
 * The Cloudflare Workers runtime adapter, inside `workerd`: this file runs in
 * the Workers runtime through `@cloudflare/vitest-plugin`, so `workersSocket`
 * dials through the runtime's own `cloudflare:sockets`. The receivers are
 * Node listeners started by `global-setup.ts`; their ports arrive through
 * `inject()`.
 */

import { AckApplicationError } from "@glion/ack";
import { describe, expect, inject, it } from "vitest";

import { MllpClient } from "../../src/index";
import type { MllpClientOptions } from "../../src/index";
import { workersSocket } from "../../src/runtime/workers";
import { adtA01 } from "../fixtures";

/** TEST-NET-1 (RFC 5737): never routed, so a SYN there is never answered. */
const BLACKHOLE = { host: "192.0.2.1", port: 65_535 };

const SHORT_TIMEOUT_MS = 300;
/** Workerd resolves `close()` at once; nothing waits for the remote system. */
const CLOSE_BOUND_MS = 500;
/** Generous bound for a 300 ms deadline to be honoured. */
const DEADLINE_SLACK_MS = 3000;

const ownerClosed = ["connect", "close:null"];

/** A client that dials once, with its events recorded. */
function connectTo(
  address: { host: string; port: number },
  options: Partial<MllpClientOptions> = {}
) {
  const events: string[] = [];
  const client = new MllpClient({
    reconnect: false,
    socket: workersSocket(address),
    ...options,
  });
  client
    .on("connect", () => events.push("connect"))
    .on("close", (error) => events.push(`close:${error?.code ?? "null"}`));
  return { client, events };
}

const loopback = (port: number) => ({ host: "127.0.0.1", port });

describe("workersSocket", () => {
  it("sends three messages on one connection", async () => {
    const { client, events } = connectTo(loopback(inject("acknowledgesPort")));

    for (let i = 0; i < 3; i += 1) {
      const { controlId, tree } = adtA01();
      await expect(client.send(tree)).resolves.toMatchObject({
        code: "AA",
        controlId,
      });
    }
    expect(client.state).toBe("connected");
    await client.close();

    expect(client.state).toBe("closed");
    expect(events).toEqual(ownerClosed);
  });

  it("reads an acknowledgment split across two chunks", async () => {
    const { client } = connectTo(loopback(inject("splitsAcknowledgmentPort")));

    await expect(client.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });
    await client.close();
  });

  it("rejects SEND_TIMEOUT and closes when the receiver stays silent", async () => {
    const { client, events } = connectTo(loopback(inject("silentPort")), {
      sendTimeoutMs: SHORT_TIMEOUT_MS,
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "SEND_TIMEOUT",
      delivery: "unknown",
    });

    expect(client.state).toBe("closed");
    expect(events).toEqual(["connect", "close:SEND_TIMEOUT"]);
  });

  it("rejects CONNECTION_LOST when the receiver drops after reading", async () => {
    const { client, events } = connectTo(
      loopback(inject("dropsAfterReadPort"))
    );

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_LOST",
      delivery: "unknown",
    });

    expect(events).toEqual(["connect", "close:CONNECTION_LOST"]);
  });

  it("reads the acknowledgment a one-shot receiver sends with its FIN", async () => {
    const { client, events } = connectTo(
      loopback(inject("acknowledgesThenEndsPort"))
    );

    await expect(client.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });

    expect(events).toEqual(["connect", "close:CONNECTION_LOST"]);
  });

  it("rejects CONNECTION_FAILED when nothing is listening", async () => {
    const { client, events } = connectTo(loopback(inject("refusedPort")));

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
      delivery: "not-sent",
    });

    expect(events).toEqual(["close:CONNECTION_FAILED"]);
  });

  it("rejects CONNECTION_TIMEOUT, in time, when the address never answers", async () => {
    const { client, events } = connectTo(BLACKHOLE, {
      connectTimeoutMs: SHORT_TIMEOUT_MS,
    });

    const started = performance.now();
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_TIMEOUT",
      delivery: "not-sent",
    });

    expect(performance.now() - started).toBeLessThan(DEADLINE_SLACK_MS);
    expect(events).toEqual(["close:CONNECTION_TIMEOUT"]);
  });

  it("rejects with the NAK and keeps the connection", async () => {
    const { client, events } = connectTo(loopback(inject("rejectsFirstPort")));

    await expect(client.send(adtA01().tree)).rejects.toBeInstanceOf(
      AckApplicationError
    );
    expect(client.state).toBe("connected");
    await expect(client.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });
    await client.close();

    expect(events).toEqual(ownerClosed);
  });

  it("dials again under the reconnect policy, then gives up", async () => {
    const { client, events } = connectTo(loopback(inject("refusedPort")), {
      reconnect: { attempts: 1, delay: () => 0 },
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });

    expect(events).toEqual(["close:CONNECTION_FAILED"]);
  });

  it("close() is bounded when the receiver never answers the FIN", async () => {
    const { client, events } = connectTo(loopback(inject("holdsOpenPort")));
    await client.connect();

    const started = performance.now();
    await client.close();

    expect(performance.now() - started).toBeLessThan(CLOSE_BOUND_MS);
    expect(events).toEqual(ownerClosed);
  });
});

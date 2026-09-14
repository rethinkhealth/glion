/**
 * `MllpClient` over a real socket, as a vitest suite an adapter
 * instantiates. Runtime-neutral, the same way as the socket contract.
 *
 * @module
 */

import { AckApplicationError } from "@glion/ack";
import { describe, expect, it } from "vitest";

import { MllpClient } from "../../src/index";
import type { MllpClientOptions, MllpSocket } from "../../src/index";
import { adtA01 } from "../fixtures";
import type { Address, Peer } from "../loopback";
import { BLACKHOLE } from "./socket-contract";

const SHORT_TIMEOUT_MS = 300;

/** Generous bound for a 300 ms deadline to be honoured. */
const DEADLINE_SLACK_MS = 3000;

export interface ClientScenarioOptions {
  /** A socket to `address`. */
  readonly open: (address: Address) => MllpSocket;
  /** A receiver behaving as `peer`, released when the test ends. */
  readonly receiver: (peer: Peer) => Promise<Address & AsyncDisposable>;
}

const ownerClosed = ["connect", "close:null"];

/**
 * Registers the scenarios for the adapter `name`, each against its own
 * receiver.
 */
export function describeMllpClientScenarios(
  name: string,
  { open, receiver }: ClientScenarioOptions
): void {
  /** A client that dials `address` once, with its events recorded. */
  function connectTo(
    address: Address,
    options: Partial<MllpClientOptions> = {}
  ) {
    const events: string[] = [];
    const client = new MllpClient({
      reconnect: false,
      socket: open(address),
      ...options,
    });
    client
      .on("connect", () => events.push("connect"))
      .on("close", (error) => events.push(`close:${error?.code ?? "null"}`));
    return { client, events };
  }

  describe(`${name}: MllpClient over a real socket`, () => {
    it("sends three messages on one connection", async () => {
      await using peer = await receiver("acknowledges");
      const { client, events } = connectTo(peer);

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
      await using peer = await receiver("splitsAcknowledgment");
      const { client } = connectTo(peer);

      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      await client.close();
    });

    it("rejects SEND_TIMEOUT and closes when the receiver stays silent", async () => {
      await using peer = await receiver("silent");
      const { client, events } = connectTo(peer, {
        sendTimeoutMs: SHORT_TIMEOUT_MS,
      });

      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: "SEND_TIMEOUT",
        delivery: "unknown",
      });

      expect(client.state).toBe("closed");
      expect(events).toEqual(["connect", "close:SEND_TIMEOUT"]);
    });

    it("rejects CONNECTION_LOST and closes when the receiver drops after reading", async () => {
      await using peer = await receiver("dropsAfterRead");
      const { client, events } = connectTo(peer);

      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: "CONNECTION_LOST",
        delivery: "unknown",
      });

      expect(events).toEqual(["connect", "close:CONNECTION_LOST"]);
    });

    it("reads the acknowledgment a one-shot receiver sends with its FIN, then loses the connection", async () => {
      await using peer = await receiver("acknowledgesThenEnds");
      const { client, events } = connectTo(peer);

      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: "CONNECTION_LOST",
      });

      expect(events).toEqual(["connect", "close:CONNECTION_LOST"]);
    });

    it("rejects CONNECTION_FAILED when nothing is listening", async () => {
      await using peer = await receiver("refused");
      const { client, events } = connectTo(peer);

      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
        delivery: "not-sent",
      });

      expect(events).toEqual(["close:CONNECTION_FAILED"]);
    });

    it("rejects CONNECTION_TIMEOUT within its deadline when the address never answers", async () => {
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
      await using peer = await receiver("rejectsFirst");
      const { client, events } = connectTo(peer);

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

    it("rejects SEND_ABORTED for the send destroy() interrupts", async () => {
      await using peer = await receiver("silent");
      const { client, events } = connectTo(peer);
      await client.connect();

      const sending = client.send(adtA01().tree);
      expect(client.state).toBe("sending");
      const aborted = expect(sending).rejects.toMatchObject({
        code: "SEND_ABORTED",
      });
      await client.destroy();

      await aborted;
      expect(events).toEqual(ownerClosed);
    });

    it("closes from connected with no error", async () => {
      await using peer = await receiver("acknowledges");
      const { client, events } = connectTo(peer);
      await client.connect();

      await client.close();

      expect(client.state).toBe("closed");
      expect(events).toEqual(ownerClosed);
    });

    it("dials again under the reconnect policy, then gives up", async () => {
      await using peer = await receiver("refused");
      const { client, events } = connectTo(peer, {
        reconnect: { attempts: 1, delay: () => 0 },
      });

      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: "CONNECTION_FAILED",
      });

      expect(events).toEqual(["close:CONNECTION_FAILED"]);
    });
  });
}

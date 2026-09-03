/**
 * The client against an in-memory connection: two `TransformStream`s stand in
 * for the socket, so every lifecycle path runs without a port.
 */

import { setTimeout as sleep } from "node:timers/promises";

import { AckApplicationError } from "@glion/ack";
import { frame } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import {
  MllpClient,
  MllpDroppedError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpSendTimeoutError,
} from "../src/index";
import type { MllpConnection, MllpConnector } from "../src/index";
import { ack, adtA01, controlIdOf } from "./fixtures";

/** A connection whose far end the test plays. */
function fakeConnection() {
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const fromClient = new TransformStream<Uint8Array, Uint8Array>();
  const remote = toClient.writable.getWriter();
  const inbox = fromClient.readable.getReader();
  let closeCalls = 0;

  const connection: MllpConnection = {
    async close() {
      closeCalls += 1;
      try {
        await remote.close();
      } catch {
        // The client cancelled its reader first, which already errored this side.
      }
    },
    readable: toClient.readable,
    writable: fromClient.writable,
  };

  /** The next frame the client wrote, as text. */
  async function received(): Promise<string> {
    const next = await inbox.read();
    if (next.done) {
      throw new Error("the client closed its writable side");
    }
    return decodeBytes(next.value);
  }

  /** The remote system answers with one framed message. */
  function reply(text: string): Promise<void> {
    return remote.write(frame(encodeBytes(text)));
  }

  return {
    /** Waits for the next message and acknowledges it with `code`. */
    async acknowledge(code: string, text = ""): Promise<void> {
      await reply(ack(code, controlIdOf(await received()), text));
    },
    get closeCalls() {
      return closeCalls;
    },
    connect: (() => Promise.resolve(connection)) satisfies MllpConnector,
    /** The remote system hangs up. */
    drop: () => remote.close(),
    received,
    /** The remote system stops reading, so the client's next write fails. */
    refuseWrites: () => inbox.cancel(),
    reply,
    /** The remote system sends bytes that are not an MLLP frame. */
    replyBytes: (bytes: Uint8Array) => remote.write(bytes),
  };
}

async function connectedClient(
  overrides: { sendTimeoutMs?: number } = {}
): Promise<{ client: MllpClient; remote: ReturnType<typeof fakeConnection> }> {
  const remote = fakeConnection();
  const client = new MllpClient({
    connect: remote.connect,
    host: "hl7.example",
    port: 2575,
    ...overrides,
  });
  await client.connect();
  return { client, remote };
}

describe("MllpClient", () => {
  describe("send()", () => {
    it("writes one frame and resolves with the acknowledgment", async () => {
      const { client, remote } = await connectedClient();

      const message = adtA01();
      const sending = client.send(message);
      expect(client.state).toBe("sending");
      const sent = await remote.received();
      expect(sent).toContain(controlIdOf(message));
      const reply = ack("AA", controlIdOf(sent));
      await remote.reply(reply);

      const response = await sending;
      expect(response.code).toBe("AA");
      expect(response.raw).toBe(reply);
      expect(response.tree.type).toBe("root");
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("rejects with the NAK and keeps the connection", async () => {
      const { client, remote } = await connectedClient();

      const sending = client.send(adtA01());
      await remote.acknowledge("AE", "Validation failed");

      await expect(sending).rejects.toBeInstanceOf(AckApplicationError);
      expect(client.state).toBe("connected");

      const again = client.send(adtA01());
      await remote.acknowledge("AA");
      await expect(again).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("connects on first use when connect() was not called", async () => {
      const remote = fakeConnection();
      const client = new MllpClient({
        connect: remote.connect,
        host: "hl7.example",
        port: 2575,
      });

      const sending = client.send(adtA01());
      await remote.acknowledge("AA");

      await expect(sending).resolves.toMatchObject({ code: "AA" });
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("reports a connect failure as the send's error", async () => {
      const refused = new Error("ECONNREFUSED");
      const client = new MllpClient({
        connect: () => Promise.reject(refused),
        host: "hl7.example",
        port: 2575,
      });

      await expect(client.send(adtA01())).rejects.toMatchObject({
        cause: refused,
        code: MllpErrorCode.CONNECT_FAILED,
        delivery: "not-sent",
      });
    });

    it("rejects INVALID_MESSAGE without writing when MSH-10 is missing", async () => {
      const { client, remote } = await connectedClient();
      const noControlId = adtA01("");

      const rejected = client.send(noControlId);
      await expect(rejected).rejects.toBeInstanceOf(MllpInvalidMessageError);
      await expect(rejected).rejects.toMatchObject({
        cause: expect.objectContaining({ name: "MissingControlIdError" }),
        code: MllpErrorCode.INVALID_MESSAGE,
        delivery: "not-sent",
      });
      expect(client.state).toBe("connected");

      const sending = client.send(adtA01());
      await remote.acknowledge("AA");
      await sending;
      await client.close();
    });

    it("rejects ALREADY_SENDING while a message is in flight", async () => {
      const { client, remote } = await connectedClient();

      const first = client.send(adtA01());
      await expect(client.send(adtA01())).rejects.toMatchObject({
        code: MllpErrorCode.ALREADY_SENDING,
      });

      await remote.acknowledge("AA");
      await first;
      await client.close();
    });

    it("rejects INVALID_RESPONSE and closes on a control-ID mismatch", async () => {
      const { client, remote } = await connectedClient();

      const message = adtA01();
      const sending = client.send(message);
      await remote.received();
      await remote.reply(ack("AA", "OTHER"));

      await expect(sending).rejects.toMatchObject({
        cause: expect.objectContaining({
          name: "UnexpectedAcknowledgmentError",
        }),
        code: MllpErrorCode.INVALID_RESPONSE,
        controlId: controlIdOf(message),
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
      await expect(client.send(adtA01())).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("rejects SEND_TIMEOUT and closes when no acknowledgment arrives", async () => {
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });

      const sending = client.send(adtA01());
      await remote.received();

      await expect(sending).rejects.toBeInstanceOf(MllpSendTimeoutError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
        delivery: "unknown",
        timeoutMs: 20,
      });
      expect(client.state).toBe("closed");
      expect(remote.closeCalls).toBe(1);
    });

    it("rejects DROPPED and closes when the remote system hangs up", async () => {
      const { client, remote } = await connectedClient();

      const sending = client.send(adtA01());
      await remote.received();
      await remote.drop();

      await expect(sending).rejects.toBeInstanceOf(MllpDroppedError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.DROPPED,
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CLOSED when close() interrupts it", async () => {
      const { client, remote } = await connectedClient();

      const sending = client.send(adtA01());
      await remote.received();
      await client.close();

      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
      expect(remote.closeCalls).toBe(1);
    });

    it("rejects CLOSED as not-sent when close() interrupts the connect it started", async () => {
      const client = new MllpClient({
        connect: async ({ signal }) => {
          await sleep(60_000, undefined, { signal });
          throw new Error("unreachable");
        },
        host: "hl7.example",
        port: 2575,
      });

      const sending = client.send(adtA01());
      await client.close();

      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
        delivery: "not-sent",
      });
    });

    it("rejects DROPPED as not-sent when the write itself fails", async () => {
      const { client, remote } = await connectedClient();
      await remote.refuseWrites();

      await expect(client.send(adtA01())).rejects.toMatchObject({
        code: MllpErrorCode.DROPPED,
        delivery: "not-sent",
      });
      expect(client.state).toBe("closed");
    });

    it("rejects INVALID_RESPONSE when the reply is not an MLLP frame", async () => {
      const { client, remote } = await connectedClient();

      const sending = client.send(adtA01());
      await remote.received();
      await remote.replyBytes(encodeBytes("HTTP/1.1 400 Bad Request\r\n"));

      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_RESPONSE,
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
    });
  });

  describe("connect()", () => {
    it("resolves at once when already connected", async () => {
      const { client } = await connectedClient();

      await client.connect();
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("lets a second call wait for the attempt in flight", async () => {
      const remote = fakeConnection();
      const client = new MllpClient({
        connect: remote.connect,
        host: "hl7.example",
        port: 2575,
      });

      await Promise.all([client.connect(), client.connect()]);
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("tells a waiting second call that the attempt failed", async () => {
      const refused = new Error("ECONNREFUSED");
      const client = new MllpClient({
        connect: () => Promise.reject(refused),
        host: "hl7.example",
        port: 2575,
      });

      const [first, second] = await Promise.allSettled([
        client.connect(),
        client.connect(),
      ]);
      expect(first).toMatchObject({
        reason: { code: MllpErrorCode.CONNECT_FAILED },
        status: "rejected",
      });
      expect(second).toMatchObject({
        reason: { code: MllpErrorCode.CONNECT_FAILED },
        status: "rejected",
      });
    });

    it("rejects CONNECT_FAILED with the connector's error as cause", async () => {
      const refused = new Error("ECONNREFUSED");
      const client = new MllpClient({
        connect: () => Promise.reject(refused),
        host: "hl7.example",
        port: 2575,
      });

      await expect(client.connect()).rejects.toMatchObject({
        cause: refused,
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECT_FAILED when the connector throws instead of rejecting", async () => {
      const boom = new Error("bad options");
      const client = new MllpClient({
        connect: () => {
          throw boom;
        },
        host: "hl7.example",
        port: 2575,
      });

      await expect(client.connect()).rejects.toMatchObject({
        cause: boom,
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECT_TIMEOUT and disposes of a connection that arrives too late", async () => {
      const remote = fakeConnection();
      const client = new MllpClient({
        connect: async () => {
          await sleep(40);
          return remote.connect();
        },
        connectTimeoutMs: 10,
        host: "hl7.example",
        port: 2575,
      });

      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_TIMEOUT,
      });
      await client.close();
      expect(remote.closeCalls).toBe(1);
    });

    it("disposes of a connection that arrives after close() cancelled the attempt", async () => {
      const remote = fakeConnection();
      const client = new MllpClient({
        connect: async () => {
          await sleep(20);
          return remote.connect();
        },
        host: "hl7.example",
        port: 2575,
      });

      const connecting = client.connect();
      await client.close();

      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_ABORTED,
      });
      expect(remote.closeCalls).toBe(1);
    });

    it("rejects CONNECT_TIMEOUT when the connector does not answer in time", async () => {
      const client = new MllpClient({
        connect: async ({ signal }) => {
          await sleep(60_000, undefined, { signal });
          throw new Error("unreachable");
        },
        connectTimeoutMs: 20,
        host: "hl7.example",
        port: 2575,
      });

      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_TIMEOUT,
      });
    });

    it("rejects CONNECT_ABORTED when close() arrives first", async () => {
      const client = new MllpClient({
        connect: async ({ signal }) => {
          await sleep(60_000, undefined, { signal });
          throw new Error("unreachable");
        },
        host: "hl7.example",
        port: 2575,
      });

      const connecting = client.connect();
      await client.close();

      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_ABORTED,
      });
    });

    it("rejects CLOSED after close()", async () => {
      const { client } = await connectedClient();
      await client.close();

      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });
  });

  describe("options", () => {
    it("rejects INVALID_OPTION for a timeout out of range", () => {
      expect(
        () =>
          new MllpClient({
            connect: fakeConnection().connect,
            host: "hl7.example",
            port: 2575,
            sendTimeoutMs: 0,
          })
      ).toThrow(MllpInvalidOptionError);
    });

    it("rejects INVALID_OPTION for a per-send timeout out of range", async () => {
      const { client } = await connectedClient();

      const sending = client.send(adtA01(), {
        timeoutMs: Number.POSITIVE_INFINITY,
      });
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_OPTION,
      });
      expect(client.state).toBe("connected");
      await client.close();
    });
  });

  describe("close()", () => {
    it("resolves from idle and is idempotent", async () => {
      const client = new MllpClient({
        connect: fakeConnection().connect,
        host: "hl7.example",
        port: 2575,
      });

      await client.close();
      await client.close();
      expect(client.state).toBe("closed");
    });

    it("closes the connection exactly once", async () => {
      const { client, remote } = await connectedClient();

      await Promise.all([client.close(), client.close()]);
      expect(remote.closeCalls).toBe(1);
    });
  });
});

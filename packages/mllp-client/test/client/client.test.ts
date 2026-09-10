/**
 * The client against an in-memory socket: two `TransformStream`s stand in for
 * the byte streams, so every lifecycle path runs without a port.
 */

import { setTimeout } from "node:timers/promises";

import { AckApplicationError } from "@glion/ack";
import { parseHL7v2 } from "@glion/parser";
import { encodeBytes } from "@glion/util-charset";
import { describe, expect, it, vi } from "vitest";

import {
  MllpClient,
  MllpConnectionLostError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpSendTimeoutError,
} from "../../src/index";
import { ack, adtA01, controlIdOf } from "../fixtures";
import { connectedClient, stubSocket } from "./fixtures";

describe("MllpClient", () => {
  describe("connect()", () => {
    it("resolves at once when the client is already connected", async () => {
      // Given
      const { client } = await connectedClient();

      // When
      await client.connect();

      // Then
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("lets a second call wait for the attempt in flight", async () => {
      // Given
      const { socket } = stubSocket();
      const client = new MllpClient({ socket });

      // When
      await Promise.all([client.connect(), client.connect()]);

      // Then
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("tells a waiting second call that the attempt failed", async () => {
      // Given
      const client = new MllpClient({
        socket: stubSocket(() => Promise.reject(new Error("ECONNREFUSED")))
          .socket,
      });

      // When
      const [first, second] = await Promise.allSettled([
        client.connect(),
        client.connect(),
      ]);

      // Then
      expect(first).toMatchObject({
        reason: { code: MllpErrorCode.CONNECT_FAILED },
        status: "rejected",
      });
      expect(second).toMatchObject({
        reason: { code: MllpErrorCode.CONNECT_FAILED },
        status: "rejected",
      });
    });

    it("tells a waiting second call that close() cancelled the attempt", async () => {
      // Given a socket that never answers
      const client = new MllpClient({
        socket: stubSocket(async (_streams, signal) => {
          await setTimeout(60_000, undefined, { signal });
          throw new Error("unreachable");
        }).socket,
      });
      const first = client.connect();
      const second = client.connect();

      // When
      await client.close();

      // Then
      await expect(first).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
      await expect(second).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("settles a waiting connect() and a queued send on the same failure", async () => {
      // Given
      const client = new MllpClient({
        socket: stubSocket(() => Promise.reject(new Error("ECONNREFUSED")))
          .socket,
      });

      // When
      const connecting = client.connect();
      const sending = client.send(adtA01().tree);

      // Then
      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_FAILED,
      });
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECT_FAILED with the socket's error as cause", async () => {
      // Given
      const refused = new Error("ECONNREFUSED");
      const client = new MllpClient({
        socket: stubSocket(() => Promise.reject(refused)).socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: refused,
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECT_FAILED when the socket throws instead of rejecting", async () => {
      // Given
      const boom = new Error("bad options");
      const client = new MllpClient({
        socket: stubSocket(() => {
          throw boom;
        }).socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: boom,
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("puts a socket's non-Error rejection in the message", async () => {
      // Given a socket that rejects with something other than an Error, which
      // caller code is free to do.
      const client = new MllpClient({
        // oxlint-disable-next-line prefer-promise-reject-errors
        socket: stubSocket(() => Promise.reject("refused by policy")).socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: "refused by policy",
        code: MllpErrorCode.CONNECT_FAILED,
        message: expect.stringContaining("refused by policy"),
      });
    });

    it("rejects CONNECT_TIMEOUT when the socket does not answer in time", async () => {
      // Given
      const client = new MllpClient({
        connectTimeoutMs: 20,
        socket: stubSocket(async (_streams, signal) => {
          await setTimeout(60_000, undefined, { signal });
          throw new Error("unreachable");
        }).socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_TIMEOUT,
      });
    });

    it("rejects CLOSED when close() arrives while it is still connecting", async () => {
      // Given a socket that never answers
      const client = new MllpClient({
        socket: stubSocket(async (_streams, signal) => {
          await setTimeout(60_000, undefined, { signal });
          throw new Error("unreachable");
        }).socket,
      });
      const connecting = client.connect();

      // When
      await client.close();

      // Then
      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("rejects CLOSED once the client is closed", async () => {
      // Given
      const { client } = await connectedClient();
      await client.close();

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("ends a socket that opens after close() cancelled the attempt", async () => {
      // Given a socket that ignores the signal and opens anyway
      const { remote, socket } = stubSocket(async (streams) => {
        await setTimeout(20); // opens after the caller has given up
        return streams;
      });
      const client = new MllpClient({ socket });
      const connecting = client.connect();

      // When
      await client.close();

      // Then
      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
      expect(remote.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("send()", () => {
    it("sends one message and resolves with its acknowledgment", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const { controlId, tree } = adtA01();

      // When
      const sending = client.send(tree);
      expect(client.state).toBe("sending");
      const sent = await remote.received();
      const reply = ack("AA", { controlId: controlIdOf(sent) }).text;
      await remote.replies(reply);

      // Then
      const response = await sending;
      expect(sent).toContain(controlId);
      expect(response.code).toBe("AA");
      expect(response.raw).toBe(reply);
      expect(response.tree.type).toBe("root");
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("connects on first use when connect() was not called", async () => {
      // Given
      const { remote, socket } = stubSocket();
      const client = new MllpClient({ socket });

      // When
      const sending = client.send(adtA01().tree);
      await remote.acknowledges("AA");

      // Then
      await expect(sending).resolves.toMatchObject({ code: "AA" });
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("rejects with the NAK and keeps the connection", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      const sending = client.send(adtA01().tree);
      await remote.acknowledges("AE", "Validation failed");

      // Then the NAK is the send's error, and the next message still goes out.
      await expect(sending).rejects.toBeInstanceOf(AckApplicationError);
      expect(client.state).toBe("connected");
      const again = client.send(adtA01().tree);
      await remote.acknowledges("AA");
      await expect(again).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("rejects INVALID_MESSAGE without writing when MSH-10 is missing", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const noControlId = adtA01({ controlId: "" }).tree;

      // When
      const rejected = client.send(noControlId);

      // Then nothing reached the wire, so the client stays usable.
      await expect(rejected).rejects.toBeInstanceOf(MllpInvalidMessageError);
      await expect(rejected).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
        message: expect.stringContaining("no MSH-10 control ID"),
      });
      expect(client.state).toBe("connected");
      const sending = client.send(adtA01().tree);
      await remote.acknowledges("AA");
      await sending;
      await client.close();
    });

    it("rejects INVALID_MESSAGE and stays usable when a message carries a reserved byte", async () => {
      // Given a message whose content carries FS, which MLLP reserves as the
      // end of a block. It parses and serializes; only framing refuses it.
      const { client, remote } = await connectedClient();
      const reserved = parseHL7v2(
        adtA01().text.replace(
          "Doe^John",
          `Doe${String.fromCodePoint(0x1c)}^John`
        )
      );

      // When
      const rejected = client.send(reserved);

      // Then nothing reached the wire, so the connection is still in step.
      await expect(rejected).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      expect(client.state).toBe("connected");
      const sending = client.send(adtA01().tree);
      await remote.acknowledges("AA");
      await expect(sending).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("rejects ALREADY_SENDING while a message is in flight", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const first = client.send(adtA01().tree);

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.ALREADY_SENDING,
      });

      await remote.acknowledges("AA");
      await first;
      await client.close();
    });

    it("rejects ALREADY_SENDING while the first send is still connecting", async () => {
      // Given a socket that takes its time to open
      const { remote, socket } = stubSocket(async (streams) => {
        await setTimeout(20);
        return streams;
      });
      const client = new MllpClient({ socket });
      const first = client.send(adtA01().tree);
      expect(client.state).toBe("connecting");

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.ALREADY_SENDING,
      });

      await remote.acknowledges("AA");
      await expect(first).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("reports a connect failure as the send's error", async () => {
      // Given
      const refused = new Error("ECONNREFUSED");
      const client = new MllpClient({
        socket: stubSocket(() => Promise.reject(refused)).socket,
      });

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        cause: refused,
        code: MllpErrorCode.CONNECT_FAILED,
      });
    });

    it("rejects CONNECTION_LOST when the write itself fails", async () => {
      // Given a remote system that has stopped reading
      const { client, remote } = await connectedClient();
      await remote.refusesWrites();

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        cause: expect.objectContaining({ message: "EPIPE" }),
        code: MllpErrorCode.CONNECTION_LOST,
        message: expect.stringContaining("EPIPE"),
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECTION_LOST and closes when the remote system hangs up", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      const sending = client.send(adtA01().tree);
      await remote.received();
      await remote.hangsUp();

      // Then
      await expect(sending).rejects.toBeInstanceOf(MllpConnectionLostError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_LOST,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects SEND_TIMEOUT and closes when no acknowledgment arrives", async () => {
      // Given
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });

      // When
      const sending = client.send(adtA01().tree);
      await remote.received();

      // Then
      await expect(sending).rejects.toBeInstanceOf(MllpSendTimeoutError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
        timeoutMs: 20,
      });
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("drops an acknowledgment that arrives after the send timed out", async () => {
      // Given a send that has already timed out
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
      const sending = client.send(adtA01().tree);
      const sent = await remote.received();
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
      });

      // When the remote system answers late, onto a connection the client has
      // already torn down.
      try {
        await remote.replies(ack("AA", { controlId: controlIdOf(sent) }).text);
      } catch {
        // The client closed its side first; writing there is the point.
      }

      // Then it changes nothing, and tears nothing down a second time.
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("rejects INVALID_RESPONSE and closes on a control-ID mismatch", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const { controlId, tree } = adtA01();

      // When the reply answers a different message
      const sending = client.send(tree);
      await remote.received();
      await remote.replies(ack("AA", { controlId: "OTHER" }).text);

      // Then the client can no longer tell which reply answers which message.
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_RESPONSE,
        controlId,
        message: expect.stringContaining('MSA-2 is "OTHER"'),
      });
      expect(client.state).toBe("closed");
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("rejects INVALID_RESPONSE and closes when the reply is not MLLP", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      const sending = client.send(adtA01().tree);
      await remote.received();
      await remote.sends(encodeBytes("HTTP/1.1 400 Bad Request\r\n"));

      // Then
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_RESPONSE,
      });
      expect(client.state).toBe("closed");
    });

    it("is let through by close(), which waits for its acknowledgment", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const sending = client.send(adtA01().tree);

      // When
      const closing = client.close();
      expect(client.state).toBe("closing");
      await remote.acknowledges("AA");

      // Then
      await expect(sending).resolves.toMatchObject({ code: "AA" });
      await closing;
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("is refused once close() has been called", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const first = client.send(adtA01().tree);

      // When
      const closing = client.close();

      // Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });

      await remote.acknowledges("AA");
      await first;
      await closing;
    });

    it("rejects CLOSED when close() interrupts the connect it started", async () => {
      // Given a socket that never answers
      const client = new MllpClient({
        socket: stubSocket(async (_streams, signal) => {
          await setTimeout(60_000, undefined, { signal });
          throw new Error("unreachable");
        }).socket,
      });
      const sending = client.send(adtA01().tree);

      // When
      await client.close();

      // Then
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });
  });

  describe("close()", () => {
    it("ends the connection", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      await client.close();

      // Then
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("ends it once, however many times it is called", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      await Promise.all([client.close(), client.close()]);
      await client.close();

      // Then
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("resolves from idle, where there is nothing to end", async () => {
      // Given
      const client = new MllpClient({ socket: stubSocket().socket });

      // When
      await client.close();

      // Then
      expect(client.state).toBe("closed");
    });

    it("still closes when the send it waits for fails", async () => {
      // Given a send that will time out
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
      const sending = client.send(adtA01().tree);
      await remote.received();

      // When
      const closing = client.close();

      // Then
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
      });
      await closing;
      expect(client.state).toBe("closed");
    });

    it("runs at the end of an `await using` block", async () => {
      // Given
      const { remote, socket } = stubSocket();
      let client: MllpClient;

      // When
      {
        await using scoped = new MllpClient({ socket });
        client = scoped;
        await scoped.connect();
      }

      // Then
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("destroy()", () => {
    it("rejects CLOSED for the send it interrupts", async () => {
      // Given
      const { client, remote } = await connectedClient();
      const sending = client.send(adtA01().tree);
      await remote.received();

      // When
      await client.destroy();

      // Then it does not wait the send out, the way close() does.
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
      expect(client.state).toBe("closed");
      expect(remote.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("options", () => {
    it("rejects INVALID_OPTION for a timeout out of range", () => {
      // Given / When / Then
      expect(
        () =>
          new MllpClient({
            sendTimeoutMs: 0,
            socket: stubSocket().socket,
          })
      ).toThrow(MllpInvalidOptionError);
    });

    it("rejects INVALID_OPTION for a byte cap that is not a positive integer", () => {
      // Given / When / Then
      expect(
        () =>
          new MllpClient({
            maxBufferedBytes: 0,
            socket: stubSocket().socket,
          })
      ).toThrow(MllpInvalidOptionError);
    });

    it("rejects INVALID_OPTION for a per-send timeout out of range", async () => {
      // Given
      const { client } = await connectedClient();

      // When
      const sending = client.send(adtA01().tree, {
        timeoutMs: Number.POSITIVE_INFINITY,
      });

      // Then nothing was sent, so the client stays usable.
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_OPTION,
      });
      expect(client.state).toBe("connected");
      await client.close();
    });
  });
});

describe("MllpClient events", () => {
  it("reports connect when the connection opens", async () => {
    // Given
    const { socket } = stubSocket();
    const client = new MllpClient({ socket });
    const opened = vi.fn();
    client.on("connect", opened);

    // When
    await client.connect();

    // Then
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("reports disconnect with no error when the owner closes", async () => {
    // Given
    const { client } = await connectedClient();
    const dropped = vi.fn();
    client.on("disconnect", dropped);

    // When
    await client.close();

    // Then
    expect(dropped).toHaveBeenCalledWith(null);
  });

  it("reports disconnect with the failure that ended the connection", async () => {
    // Given
    const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
    const dropped = vi.fn();
    client.on("disconnect", dropped);

    // When
    const sending = client.send(adtA01().tree);
    await remote.received();
    await expect(sending).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });

    // Then
    expect(dropped).toHaveBeenCalledWith(
      expect.objectContaining({ code: MllpErrorCode.SEND_TIMEOUT })
    );
    expect(remote.close).toHaveBeenCalledTimes(1);
  });

  it("does not report a connection that never opened as a disconnect", async () => {
    // Given
    const client = new MllpClient({ socket: stubSocket().socket });
    const dropped = vi.fn();
    const done = vi.fn();
    client.on("disconnect", dropped).on("close", done);

    // When
    await client.close();

    // Then
    expect(dropped).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("reports close once, however many times close() is called", async () => {
    // Given
    const { client } = await connectedClient();
    const done = vi.fn();
    client.on("close", done);

    // When
    await client.close();
    await client.close();

    // Then
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stops calling a listener that was removed", async () => {
    // Given
    const client = new MllpClient({ socket: stubSocket().socket });
    const opened = vi.fn();
    client.on("connect", opened).off("connect", opened);

    // When
    await client.connect();

    // Then
    expect(opened).not.toHaveBeenCalled();
  });
});

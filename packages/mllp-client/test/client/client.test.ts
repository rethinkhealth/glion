/**
 * The client as an integrator uses it, against an in-memory remote system:
 * an MLLP peer that acknowledges what it receives, and fails the connection
 * on demand.
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
import {
  acknowledging,
  connectedClient,
  remoteSystem,
  silence,
} from "./fixtures";
import type { Opening } from "./fixtures";

/** A socket the remote system refuses with `error`. */
function refused(error: unknown): Opening {
  // oxlint-disable-next-line promise/no-promise-in-callback -- the socket's `connect()` rejects, as an adapter's does
  return () => Promise.reject(error);
}

/** A socket the remote system never answers, until the client gives up. */
const unanswered: Opening = async (_streams, signal) => {
  await setTimeout(60_000, undefined, { signal });
  throw new Error("unreachable");
};

/** A socket that opens after `ms`. */
const slow =
  (ms: number): Opening =>
  async (streams) => {
    await setTimeout(ms);
    return streams;
  };

/** A socket whose first `failures` attempts are refused; later ones open. */
function flaky(failures: number): Opening {
  let attempt = 0;
  return (streams) => {
    attempt += 1;
    return attempt <= failures
      ? Promise.reject(new Error("ECONNREFUSED"))
      : Promise.resolve(streams);
  };
}

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
      const remote = remoteSystem();
      const client = new MllpClient({ socket: remote.socket });

      // When
      await Promise.all([client.connect(), client.connect()]);

      // Then
      expect(client.state).toBe("connected");
      expect(remote.opened).toBe(1);
      await client.close();
    });

    it("tells a waiting second call that the attempt failed", async () => {
      // Given
      const remote = remoteSystem(refused(new Error("ECONNREFUSED")));
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When
      const [first, second] = await Promise.allSettled([
        client.connect(),
        client.connect(),
      ]);

      // Then
      expect(first).toMatchObject({
        reason: { code: MllpErrorCode.CONNECTION_FAILED },
        status: "rejected",
      });
      expect(second).toMatchObject({
        reason: { code: MllpErrorCode.CONNECTION_FAILED },
        status: "rejected",
      });
    });

    it("tells a waiting second call that close() cancelled the attempt", async () => {
      // Given
      const remote = remoteSystem(unanswered);
      const client = new MllpClient({ socket: remote.socket });
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
      const remote = remoteSystem(refused(new Error("ECONNREFUSED")));
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When
      const connecting = client.connect();
      const sending = client.send(adtA01().tree);

      // Then
      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECTION_FAILED with the socket's error as cause", async () => {
      // Given
      const error = new Error("ECONNREFUSED");
      const remote = remoteSystem(refused(error));
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: error,
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECTION_FAILED when the socket throws instead of rejecting", async () => {
      // Given
      const boom = new Error("bad options");
      const remote = remoteSystem(() => {
        throw boom;
      });
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: boom,
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      expect(client.state).toBe("closed");
    });

    it("keeps a socket's non-Error rejection as the cause", async () => {
      // Given a socket that rejects with something other than an Error, which
      // adapter code is free to do.
      const remote = remoteSystem(refused("refused by policy"));
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        cause: "refused by policy",
        code: MllpErrorCode.CONNECTION_FAILED,
      });
    });

    it("rejects CONNECTION_TIMEOUT when the socket does not answer in time", async () => {
      // Given
      const remote = remoteSystem(unanswered);
      const client = new MllpClient({
        connectTimeoutMs: 20,
        reconnect: false,
        socket: remote.socket,
      });

      // When / Then
      await expect(client.connect()).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_TIMEOUT,
      });
    });

    it("rejects CLOSED when close() arrives while it is still connecting", async () => {
      // Given
      const remote = remoteSystem(unanswered);
      const client = new MllpClient({ socket: remote.socket });
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
      // Given a socket that ignores the cancellation and opens anyway
      const remote = remoteSystem(slow(20));
      const client = new MllpClient({ socket: remote.socket });
      const connecting = client.connect();

      // When
      await client.close();

      // Then
      await expect(connecting).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
      expect(remote.closed).toBe(1);
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
      const response = await sending;

      // Then
      expect(remote.received[0]).toContain(controlId);
      expect(response.code).toBe("AA");
      expect(response.controlId).toBe(controlId);
      expect(response.raw).toContain(`MSA|AA|${controlId}`);
      expect(response.tree.type).toBe("root");
      expect(client.state).toBe("connected");
      await client.close();
    });

    it("connects on first use when connect() was not called", async () => {
      // Given
      const remote = remoteSystem();
      const client = new MllpClient({ socket: remote.socket });

      // When / Then
      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      expect(client.state).toBe("connected");
      expect(remote.opened).toBe(1);
      await client.close();
    });

    it("rejects with the NAK and keeps the connection", async () => {
      // Given a remote system that refuses the message
      const { client, remote } = await connectedClient();
      remote.answers(acknowledging("AE", "Validation failed"));

      // When / Then the NAK is the send's error ...
      await expect(client.send(adtA01().tree)).rejects.toBeInstanceOf(
        AckApplicationError
      );
      expect(client.state).toBe("connected");

      // ... and the next message still goes out on the same connection.
      remote.answers(acknowledging("AA"));
      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      expect(remote.opened).toBe(1);
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
        cause: expect.stringContaining("no MSH-10 control ID"),
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      expect(client.state).toBe("connected");
      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      expect(remote.received).toHaveLength(1);
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
      await expect(client.send(adtA01().tree)).resolves.toMatchObject({
        code: "AA",
      });
      expect(remote.received).toHaveLength(1);
      await client.close();
    });

    it("rejects ALREADY_SENDING while a message is in flight", async () => {
      // Given
      const { client } = await connectedClient();
      const first = client.send(adtA01().tree);

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.ALREADY_SENDING,
      });
      await expect(first).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("rejects ALREADY_SENDING while the first send is still connecting", async () => {
      // Given a socket that takes its time to open
      const remote = remoteSystem(slow(20));
      const client = new MllpClient({ socket: remote.socket });
      const first = client.send(adtA01().tree);
      expect(client.state).toBe("connecting");

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.ALREADY_SENDING,
      });
      await expect(first).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("reports a connect failure as the send's error", async () => {
      // Given
      const error = new Error("ECONNREFUSED");
      const remote = remoteSystem(refused(error));
      const client = new MllpClient({
        reconnect: false,
        socket: remote.socket,
      });

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        cause: error,
        code: MllpErrorCode.CONNECTION_FAILED,
        delivery: "not-sent",
      });
    });

    it("rejects CONNECTION_LOST when the write itself fails", async () => {
      // Given a remote system that has stopped reading
      const { client, remote } = await connectedClient();
      await remote.stopsReading();

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        cause: expect.objectContaining({ message: "EPIPE" }),
        code: MllpErrorCode.CONNECTION_LOST,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects CONNECTION_LOST and closes when the remote system hangs up instead of answering", async () => {
      // Given
      const { client, remote } = await connectedClient();
      remote.answers(silence);

      // When
      const sending = client.send(adtA01().tree);
      await remote.receives();
      await remote.hangsUp();

      // Then
      await expect(sending).rejects.toBeInstanceOf(MllpConnectionLostError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_LOST,
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
    });

    it("resolves with an acknowledgment the remote system sends just before hanging up", async () => {
      // Given
      const { client, remote } = await connectedClient();
      remote.answers(silence);
      const { controlId, tree } = adtA01();

      // When the acknowledgment and the end of the stream arrive together
      const sending = client.send(tree);
      await remote.receives();
      await remote.replies(ack("AA", { controlId }).text);
      void remote.hangsUp();

      // Then the acknowledgment is read before the end is seen
      await expect(sending).resolves.toMatchObject({ code: "AA" });
      await client.close();
    });

    it("rejects SEND_TIMEOUT and closes when no acknowledgment arrives", async () => {
      // Given a remote system that never answers
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
      remote.answers(silence);

      // When
      const sending = client.send(adtA01().tree);

      // Then
      await expect(sending).rejects.toBeInstanceOf(MllpSendTimeoutError);
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
        timeoutMs: 20,
      });
      expect(client.state).toBe("closed");
      expect(remote.closed).toBe(1);
    });

    it("drops an acknowledgment that arrives after the send timed out", async () => {
      // Given a remote system that answers late
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
      remote.answers(async (message) => {
        await setTimeout(50);
        return ack("AA", { controlId: controlIdOf(message) }).text;
      });

      // When
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
      });
      await setTimeout(60); // the late answer lands on a torn-down socket

      // Then it changes nothing, and tears nothing down a second time.
      expect(client.state).toBe("closed");
      expect(remote.closed).toBe(1);
    });

    it("rejects INVALID_RESPONSE and closes on a control-ID mismatch", async () => {
      // Given a remote system whose reply answers a different message
      const { client, remote } = await connectedClient();
      remote.answers(() => ack("AA", { controlId: "OTHER" }).text);
      const { controlId, tree } = adtA01();

      // When / Then the client can no longer tell which reply answers which
      // message.
      await expect(client.send(tree)).rejects.toMatchObject({
        cause: expect.stringContaining('MSA-2 is "OTHER"'),
        code: MllpErrorCode.INVALID_RESPONSE,
        controlId,
      });
      expect(client.state).toBe("closed");
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
    });

    it("rejects INVALID_RESPONSE and closes when a NAK answers a different message", async () => {
      // Given a rejection that names a message this client never sent
      const { client, remote } = await connectedClient();
      remote.answers(() => ack("AE", { controlId: "OTHER" }).text);
      const { controlId, tree } = adtA01();

      // When / Then a NAK answers this message only if MSA-2 says it does —
      // the same verdict an accept gets on the same evidence.
      await expect(client.send(tree)).rejects.toMatchObject({
        cause: expect.stringContaining('MSA-2 is "OTHER"'),
        code: MllpErrorCode.INVALID_RESPONSE,
        controlId,
      });
      expect(client.state).toBe("closed");
    });

    it("rejects INVALID_RESPONSE and closes when the reply is not MLLP", async () => {
      // Given
      const { client, remote } = await connectedClient();
      remote.answers(() => encodeBytes("HTTP/1.1 400 Bad Request\r\n"));

      // When / Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
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

      // Then
      await expect(sending).resolves.toMatchObject({ code: "AA" });
      await closing;
      expect(client.state).toBe("closed");
      expect(remote.closed).toBe(1);
    });

    it("is refused once close() has been called", async () => {
      // Given
      const { client } = await connectedClient();
      const first = client.send(adtA01().tree);

      // When
      const closing = client.close();

      // Then
      await expect(client.send(adtA01().tree)).rejects.toMatchObject({
        code: MllpErrorCode.CLOSED,
      });
      await expect(first).resolves.toMatchObject({ code: "AA" });
      await closing;
    });

    it("rejects CLOSED when close() interrupts the connect it started", async () => {
      // Given
      const remote = remoteSystem(unanswered);
      const client = new MllpClient({ socket: remote.socket });
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
      expect(remote.closed).toBe(1);
    });

    it("ends it once, however many times it is called", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      await Promise.all([client.close(), client.close()]);
      await client.close();

      // Then
      expect(remote.closed).toBe(1);
    });

    it("resolves from idle, where there is nothing to end", async () => {
      // Given
      const client = new MllpClient({ socket: remoteSystem().socket });

      // When
      await client.close();

      // Then
      expect(client.state).toBe("closed");
    });

    it("still closes when the send it waits for fails", async () => {
      // Given a send that will time out
      const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
      remote.answers(silence);
      const sending = client.send(adtA01().tree);

      // When
      const closing = client.close();

      // Then
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
      });
      await closing;
      expect(client.state).toBe("closed");
      expect(remote.opened).toBe(1);
    });

    it("runs at the end of an `await using` block", async () => {
      // Given
      const remote = remoteSystem();
      let client: MllpClient;

      // When
      {
        await using scoped = new MllpClient({ socket: remote.socket });
        client = scoped;
        await scoped.connect();
      }

      // Then
      expect(client.state).toBe("closed");
      expect(remote.closed).toBe(1);
    });
  });

  describe("destroy()", () => {
    it("rejects SEND_ABORTED for the send it interrupts", async () => {
      // Given a message waiting for its acknowledgment
      const { client, remote } = await connectedClient();
      remote.answers(silence);
      const sending = client.send(adtA01().tree);
      await remote.receives();

      // When
      await client.destroy();

      // Then it does not wait the send out, the way close() does.
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.SEND_ABORTED,
        delivery: "unknown",
      });
      expect(client.state).toBe("closed");
      expect(remote.closed).toBe(1);
    });
  });

  describe("options", () => {
    it("rejects INVALID_OPTION for a timeout out of range", () => {
      // Given / When / Then
      expect(
        () =>
          new MllpClient({
            sendTimeoutMs: 0,
            socket: remoteSystem().socket,
          })
      ).toThrow(MllpInvalidOptionError);
    });

    it("rejects INVALID_OPTION for a byte cap that is not a positive integer", () => {
      // Given / When / Then
      expect(
        () =>
          new MllpClient({
            maxBufferedBytes: 0,
            socket: remoteSystem().socket,
          })
      ).toThrow(MllpInvalidOptionError);
    });

    it("rejects INVALID_OPTION for an attempt count that is not a non-negative integer", () => {
      // Given / When / Then
      for (const attempts of [-1, 1.5, Number.NaN]) {
        expect(
          () =>
            new MllpClient({
              reconnect: { attempts },
              socket: remoteSystem().socket,
            })
        ).toThrow(MllpInvalidOptionError);
      }
    });

    it("rejects INVALID_OPTION for a per-send timeout out of range", async () => {
      // Given
      const { client, remote } = await connectedClient();

      // When
      const sending = client.send(adtA01().tree, {
        timeoutMs: Number.POSITIVE_INFINITY,
      });

      // Then nothing was sent, so the client stays usable.
      await expect(sending).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_OPTION,
      });
      expect(client.state).toBe("connected");
      expect(remote.received).toHaveLength(0);
      await client.close();
    });
  });
});

describe("MllpClient events", () => {
  it("reports connect when the connection opens", async () => {
    // Given
    const client = new MllpClient({ socket: remoteSystem().socket });
    const opened = vi.fn();
    client.on("connect", opened);

    // When
    await client.connect();

    // Then
    expect(opened).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("reports close with no error when the owner closes", async () => {
    // Given
    const { client } = await connectedClient();
    const done = vi.fn();
    client.on("close", done);

    // When
    await client.close();

    // Then
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(null);
  });

  it("reports close with the failure that closed the client", async () => {
    // Given a remote system that never answers
    const { client, remote } = await connectedClient({ sendTimeoutMs: 20 });
    remote.answers(silence);
    const done = vi.fn();
    client.on("close", done);

    // When
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });

    // Then
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ code: MllpErrorCode.SEND_TIMEOUT })
    );
    expect(remote.closed).toBe(1);
  });

  it("reports close from idle, with no error", async () => {
    // Given
    const client = new MllpClient({ socket: remoteSystem().socket });
    const done = vi.fn();
    client.on("close", done);

    // When
    await client.close();

    // Then
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(null);
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
    const client = new MllpClient({ socket: remoteSystem().socket });
    const opened = vi.fn();
    client.on("connect", opened).off("connect", opened);

    // When
    await client.connect();

    // Then
    expect(opened).not.toHaveBeenCalled();
    await client.close();
  });
});

describe("MllpClient reconnect", () => {
  /** A policy that dials again at once. */
  const atOnce = { delay: () => 0 };

  it("dials again when the first attempt fails, until one opens", async () => {
    // Given
    const remote = remoteSystem(flaky(2));
    const delay = vi.fn(() => 0);
    const client = new MllpClient({
      reconnect: { delay },
      socket: remote.socket,
    });

    // When
    await client.connect();

    // Then
    expect(client.state).toBe("connected");
    expect(remote.opened).toBe(3);
    expect(delay.mock.calls).toEqual([[1], [2]]);
    await client.close();
  });

  it("waits the delay the policy gives before each attempt", async () => {
    // Given
    const delays = [5, 10];
    const remote = remoteSystem(flaky(2));
    const delay = vi.fn((attempt: number) => delays[attempt - 1] ?? 0);
    const client = new MllpClient({
      reconnect: { delay },
      socket: remote.socket,
    });

    // When
    const startedAt = performance.now();
    await client.connect();

    // Then
    expect(remote.opened).toBe(3);
    expect(delay.mock.calls).toEqual([[1], [2]]);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(14);
    await client.close();
  });

  it("stops at the attempt limit and closes with the last failure", async () => {
    // Given
    const remote = remoteSystem(flaky(Number.POSITIVE_INFINITY));
    const client = new MllpClient({
      reconnect: { attempts: 2, ...atOnce },
      socket: remote.socket,
    });
    const done = vi.fn();
    client.on("close", done);

    // When / Then
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_FAILED,
    });
    expect(client.state).toBe("closed");
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ code: MllpErrorCode.CONNECTION_FAILED })
    );
    expect(remote.opened).toBe(3);
    expect(done).toHaveBeenCalledTimes(1);

    // And a later call says why the client closed.
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: MllpErrorCode.CONNECTION_FAILED }),
      code: MllpErrorCode.CLOSED,
    });
  });

  it("dials once when reconnect is off", async () => {
    // Given
    const remote = remoteSystem(flaky(1));
    const client = new MllpClient({ reconnect: false, socket: remote.socket });

    // When / Then
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_FAILED,
    });
    expect(remote.opened).toBe(1);
    expect(client.state).toBe("closed");
  });

  it("gives a send arriving during the dialing the connection it opens", async () => {
    // Given a first attempt refused, and a second one on its way
    const remote = remoteSystem(flaky(1));
    const client = new MllpClient({
      reconnect: { delay: () => 20 },
      socket: remote.socket,
    });
    const opened = vi.fn();
    client.on("connect", opened);
    const connecting = client.connect();

    // When
    const sending = client.send(adtA01().tree);
    expect(client.state).toBe("connecting");

    // Then
    await connecting;
    await expect(sending).resolves.toMatchObject({ code: "AA" });
    expect(remote.opened).toBe(2);
    expect(opened).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("gives a send arriving during the dialing the failure the policy gave up on", async () => {
    // Given
    const remote = remoteSystem(flaky(Number.POSITIVE_INFINITY));
    const client = new MllpClient({
      reconnect: { attempts: 1, ...atOnce },
      socket: remote.socket,
    });
    const connecting = client.connect();

    // When
    const sending = client.send(adtA01().tree);

    // Then both get the same failure
    await expect(connecting).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_FAILED,
    });
    await expect(sending).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_FAILED,
    });
    expect(client.state).toBe("closed");
  });

  it("closes with CONNECTION_LOST when the connection is lost mid-send, whatever the policy", async () => {
    // Given
    const { client, remote } = await connectedClient({ reconnect: atOnce });
    remote.answers(silence);
    const events = vi.fn();
    client
      .on("connect", () => events("connect"))
      .on("close", (error) => events("close", error?.code));

    // When the remote system hangs up instead of answering
    const sending = client.send(adtA01().tree);
    await remote.receives();
    await remote.hangsUp();

    // Then the send fails, the client is closed, and nothing is dialed again.
    await expect(sending).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_LOST,
    });
    expect(client.state).toBe("closed");
    expect(remote.opened).toBe(1);
    expect(remote.closed).toBe(1);
    expect(events.mock.calls).toEqual([
      ["close", MllpErrorCode.CONNECTION_LOST],
    ]);
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: MllpErrorCode.CONNECTION_LOST }),
      code: MllpErrorCode.CLOSED,
    });
  });

  it("closes with INVALID_RESPONSE when the connection closes partway through the reply", async () => {
    // Given a remote system that hangs up half a frame into its reply
    const { client, remote } = await connectedClient({ reconnect: atOnce });
    remote.answers(silence);

    // When
    const sending = client.send(adtA01().tree);
    await remote.receives();
    await remote.sends(new Uint8Array([0x0b, 0x4d, 0x53, 0x48]));
    await remote.hangsUp();

    // Then
    await expect(sending).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "INCOMPLETE_MESSAGE" }),
      code: MllpErrorCode.INVALID_RESPONSE,
      delivery: "unknown",
    });
    expect(client.state).toBe("closed");
    expect(remote.opened).toBe(1);
  });

  it("closes with SEND_TIMEOUT when a send timed out", async () => {
    // Given
    const { client, remote } = await connectedClient({
      reconnect: atOnce,
      sendTimeoutMs: 20,
    });
    remote.answers(silence);

    // When / Then
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });
    expect(client.state).toBe("closed");
    await expect(client.connect()).rejects.toMatchObject({
      cause: expect.objectContaining({ code: MllpErrorCode.SEND_TIMEOUT }),
      code: MllpErrorCode.CLOSED,
    });
  });

  it("stops at once when close() arrives during the wait between attempts", async () => {
    // Given a send waiting out the delay before the second attempt
    const remote = remoteSystem(flaky(1));
    const client = new MllpClient({
      reconnect: { delay: () => 60_000 },
      socket: remote.socket,
    });
    const done = vi.fn();
    client.on("close", done);
    const sending = client.send(adtA01().tree);
    await vi.waitFor(() => expect(remote.opened).toBe(1));
    expect(client.state).toBe("connecting");

    // When
    await client.close();

    // Then
    await expect(sending).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    expect(client.state).toBe("closed");
    expect(done).toHaveBeenCalledWith(null);
    expect(done).toHaveBeenCalledTimes(1);
    expect(remote.opened).toBe(1);
  });

  it("stops at once when destroy() arrives during an attempt", async () => {
    // Given a remote system that never answers the socket
    const remote = remoteSystem(unanswered);
    const client = new MllpClient({ reconnect: atOnce, socket: remote.socket });
    const sending = client.send(adtA01().tree);
    await vi.waitFor(() => expect(remote.opened).toBe(1));

    // When
    await client.destroy();

    // Then
    await expect(sending).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    expect(client.state).toBe("closed");
    expect(remote.signal?.aborted).toBe(true);
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

describe("MllpClient — an application that overlaps sends", () => {
  it("fires a batch with Promise.all: the first goes out, the rest are refused, not queued", async () => {
    // Given a remote system that acknowledges every message it receives
    const { client, remote } = await connectedClient();
    const batch = [adtA01(), adtA01(), adtA01()];

    // When the application sends all three at once, as it would with any
    // HTTP client
    const [first, second, third] = await Promise.allSettled(
      batch.map((m) => client.send(m.tree))
    );

    // Then the first is acknowledged ...
    expect(first).toMatchObject({
      status: "fulfilled",
      value: { code: "AA", controlId: batch[0]?.controlId },
    });

    // ... and the other two are refused by the client before anything is
    // written. Each refusal names the message that was in flight, and
    // `delivery` says the refused message never left the process.
    for (const refusal of [second, third]) {
      expect(refusal).toMatchObject({
        reason: {
          code: MllpErrorCode.ALREADY_SENDING,
          controlId: batch[0]?.controlId,
          delivery: "not-sent",
        },
        status: "rejected",
      });
    }

    // The client is unharmed, and the remote system only ever saw the first
    // message: the other two were not delayed, they were dropped.
    expect(client.state).toBe("connected");
    expect(remote.received.map(controlIdOf)).toEqual([batch[0]?.controlId]);
    expect(remote.opened).toBe(1);
    await client.close();
  });

  it("delivers the rest of a series when one message cannot be sent", async () => {
    // Given a series whose second message carries a reserved MLLP byte
    const { client, remote } = await connectedClient();
    const first = adtA01();
    const unsendable = parseHL7v2(
      adtA01().text.replace("Doe^John", `Doe${String.fromCodePoint(0x1c)}^John`)
    );
    const third = adtA01();

    // When the application sends them in turn, going on past the rejection
    const outcomes: unknown[] = [];
    for (const tree of [first.tree, unsendable, third.tree]) {
      try {
        const { controlId } = await client.send(tree);
        outcomes.push(controlId);
      } catch (error) {
        outcomes.push(error);
      }
    }

    // Then the unsendable message was refused before anything was written,
    // and the two around it reached the remote system in order on the same
    // connection.
    expect(outcomes).toEqual([
      first.controlId,
      expect.objectContaining({
        code: MllpErrorCode.INVALID_MESSAGE,
        delivery: "not-sent",
      }),
      third.controlId,
    ]);
    expect(remote.received.map(controlIdOf)).toEqual([
      first.controlId,
      third.controlId,
    ]);
    expect(remote.opened).toBe(1);
    expect(client.state).toBe("connected");
    await client.close();
  });

  it("sends nothing behind a message whose delivery is unknown", async () => {
    // Given a remote system that hangs up while answering the second message
    const { client, remote } = await connectedClient();
    const batch = [adtA01(), adtA01(), adtA01()];
    remote.answers((message) => {
      if (controlIdOf(message) === batch[1]?.controlId) {
        void remote.hangsUp();
        return;
      }
      return ack("AA", { controlId: controlIdOf(message) }).text;
    });

    // When the application sends the series in turn
    const outcomes: unknown[] = [];
    for (const m of batch) {
      try {
        const { controlId } = await client.send(m.tree);
        outcomes.push(controlId);
      } catch (error) {
        outcomes.push(error);
      }
    }

    // Then the second message's delivery is unknown, the third was never
    // sent, and the remote system saw exactly the first two.
    expect(outcomes).toEqual([
      batch[0]?.controlId,
      expect.objectContaining({
        code: MllpErrorCode.CONNECTION_LOST,
        delivery: "unknown",
      }),
      expect.objectContaining({
        code: MllpErrorCode.CLOSED,
        delivery: "not-sent",
      }),
    ]);
    expect(remote.received.map(controlIdOf)).toEqual([
      batch[0]?.controlId,
      batch[1]?.controlId,
    ]);
    expect(client.state).toBe("closed");
  });

  it("awaits each send in turn: the same batch is delivered in order", async () => {
    // Given
    const { client, remote } = await connectedClient();
    const batch = [adtA01(), adtA01(), adtA01()];

    // When the application sends them one after the other
    for (const m of batch) {
      await expect(client.send(m.tree)).resolves.toMatchObject({
        code: "AA",
        controlId: m.controlId,
      });
    }

    // Then the remote system saw all three, in order.
    expect(remote.received.map(controlIdOf)).toEqual(
      batch.map((m) => m.controlId)
    );
    await client.close();
  });
});

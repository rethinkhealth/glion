import { setTimeout as delay } from "node:timers/promises";

// oxlint-disable require-await
import { frame } from "@glion/mllp-codec";

import { MllpServerError, MllpServerErrorCode } from "../../src/errors";
import { handleConnection } from "../../src/server/connection";
import type { MllpSocket } from "../../src/server/connection";

const ADT = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|MSG001|P|2.5.1";
const ORU = "MSH|^~\\&|S|F|R|RF|20240101||ORU^R01|MSG002|P|2.5.1";

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** An accepted connection over Web Streams, and the remote system's end of it. */
function memorySocket() {
  let inbound!: ReadableStreamDefaultController<Uint8Array>;
  let ended = false;
  const written: string[] = [];
  const socket: MllpSocket & { closes: number } = {
    close() {
      socket.closes += 1;
      if (!ended) {
        ended = true;
        inbound.close();
      }
    },
    closes: 0,
    readable: new ReadableStream({
      start(controller) {
        inbound = controller;
      },
    }),
    writable: new WritableStream({
      write(chunk) {
        written.push(decode(chunk));
      },
    }),
  };
  return {
    /** Closes the remote system's side. */
    end() {
      ended = true;
      inbound.close();
    },
    /** Tears the connection down, as a reset does. */
    lose() {
      ended = true;
      inbound.error(new MllpServerError(MllpServerErrorCode.CONNECTION_LOST));
    },
    send(bytes: Uint8Array) {
      inbound.enqueue(bytes);
    },
    socket,
    written,
  };
}

/** Replies `ACK:<the message>`. */
async function echo(payload: Uint8Array): Promise<Uint8Array> {
  return encode(`ACK:${decode(payload)}`);
}

describe("handleConnection", () => {
  it("replies to each message with MLLP framing, in order", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    remote.send(frame(encode(ORU)));
    remote.end();

    await handleConnection(echo, remote.socket);
    expect(remote.written).toEqual([
      decode(frame(encode(`ACK:${ADT}`))),
      decode(frame(encode(`ACK:${ORU}`))),
    ]);
  });

  it("writes nothing for a message handle() gives no response", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    remote.end();

    await handleConnection(async () => {}, remote.socket);
    expect(remote.written).toEqual([]);
  });

  it("closes the socket once the remote system closes its side", async () => {
    const remote = memorySocket();
    remote.end();

    await handleConnection(echo, remote.socket);
    expect(remote.socket.closes).toBeGreaterThan(0);
  });

  it("resolves once the connection is lost, and handles no message still queued", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    const handled: string[] = [];

    await handleConnection(async (payload) => {
      handled.push(decode(payload));
      remote.send(frame(encode(ORU)));
      remote.lose();
      return echo(payload);
    }, remote.socket);
    expect(handled).toEqual([ADT]);
    expect(remote.socket.closes).toBeGreaterThan(0);
  });

  it("resolves once the connection is lost in the middle of a message", async () => {
    const remote = memorySocket();
    const closed = handleConnection(echo, remote.socket);
    remote.send(encode("\u000BMSH|^~\\&|"));
    await delay(0);
    remote.lose();

    await expect(closed).resolves.toBeUndefined();
  });

  it("rejects with PROTOCOL_VIOLATION when bytes arrive outside a frame", async () => {
    const remote = memorySocket();
    remote.send(encode(ADT));
    remote.end();

    const closed = handleConnection(echo, remote.socket);
    await expect(closed).rejects.toBeInstanceOf(MllpServerError);
    await expect(closed).rejects.toMatchObject({ code: "PROTOCOL_VIOLATION" });
  });

  it("rejects with UNFRAMEABLE_RESPONSE when a response carries an FS byte", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    remote.end();

    await expect(
      handleConnection(async () => encode("MSH|\u001C"), remote.socket)
    ).rejects.toMatchObject({ code: "UNFRAMEABLE_RESPONSE" });
  });

  it("rejects with what handle() throws, and closes the socket", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    const thrown = new Error("no parser");

    await expect(
      handleConnection(async () => {
        throw thrown;
      }, remote.socket)
    ).rejects.toBe(thrown);
    expect(remote.socket.closes).toBeGreaterThan(0);
  });

  it("rejects with an error the socket's readable raises", async () => {
    const failure = new Error("bad record mac");
    const socket: MllpSocket = {
      close() {},
      readable: new ReadableStream({
        start(controller) {
          controller.error(failure);
        },
      }),
      writable: new WritableStream(),
    };

    await expect(handleConnection(echo, socket)).rejects.toBe(failure);
  });

  it("rejects with an error the socket's writable raises", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    const failure = new Error("write failed");
    const socket: MllpSocket = {
      ...remote.socket,
      writable: new WritableStream({
        write() {
          throw failure;
        },
      }),
    };

    await expect(handleConnection(echo, socket)).rejects.toBe(failure);
  });

  it("ends an idle connection when the signal aborts", async () => {
    const remote = memorySocket();
    const shutdown = new AbortController();

    const closed = handleConnection(echo, remote.socket, {
      signal: shutdown.signal,
    });
    shutdown.abort();
    await closed;
    expect(remote.socket.closes).toBeGreaterThan(0);
  });

  it("answers the message in progress before the signal ends the connection", async () => {
    const remote = memorySocket();
    const shutdown = new AbortController();
    remote.send(frame(encode(ADT)));

    await handleConnection(
      async (payload) => {
        shutdown.abort();
        return echo(payload);
      },
      remote.socket,
      { signal: shutdown.signal }
    );
    expect(remote.written).toEqual([decode(frame(encode(`ACK:${ADT}`)))]);
  });

  it("handles no message when the signal has already aborted", async () => {
    const remote = memorySocket();
    remote.send(frame(encode(ADT)));
    const calls: Uint8Array[] = [];

    await handleConnection(
      async (payload) => {
        calls.push(payload);
        return echo(payload);
      },
      remote.socket,
      { signal: AbortSignal.abort() }
    );
    expect(calls).toEqual([]);
  });
});

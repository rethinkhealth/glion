/**
 * Integration tests for the Node runtime adapter.
 *
 * Uses a real localhost `net.createServer` so the WHATWG-Streams →
 * Node `Duplex.toWeb` bridge is exercised. These are slower than
 * the in-memory `client.test.ts` suite (each test pays a few ms for
 * socket setup) but they verify the live contract — `close()` is
 * idempotent, `closed` resolves on peer FIN, signal cancellation
 * destroys an in-flight socket — that the fake duplex can only
 * stub.
 */

import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

import { frame } from "@glion/mllp-transport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MllpClient } from "../src/index";
import { connectNode } from "../src/runtime/node";

interface ServerHandle {
  readonly host: string;
  readonly port: number;
  /** Stop accepting and destroy any open sockets. */
  close(): Promise<void>;
  /** Destroy all currently open client sockets (simulate peer drop). */
  dropAllSockets(): void;
}

interface ServerOptions {
  /**
   * Called for each accepted socket. Default: echo MLLP-framed ACK_AA
   * whenever the client sends a complete frame.
   */
  onConnection?: (socket: Socket) => void;
}

const ACK_AA = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK001|P|2.5",
  "MSA|AA|MSG001",
].join("\r");

const REQUEST = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

async function startEchoAckServer(
  opts: ServerOptions = {}
): Promise<ServerHandle> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    if (opts.onConnection) {
      opts.onConnection(socket);
      return;
    }
    // Default: respond with ACK_AA to any inbound MLLP frame.
    socket.on("data", () => {
      socket.write(frame(ACK_AA));
    });
  });

  // oxlint-disable-next-line promise/avoid-new -- wrapping Node event
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    async close() {
      for (const s of sockets) {
        s.destroy();
      }
      // oxlint-disable-next-line promise/avoid-new -- wrapping Node event
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
    dropAllSockets() {
      for (const s of sockets) {
        s.destroy();
      }
    },
    host: address.address,
    port: address.port,
  };
}

describe("connectNode — happy path", () => {
  let server: ServerHandle;
  beforeEach(async () => {
    server = await startEchoAckServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("resolves to an MllpDuplex when the server accepts", async () => {
    const ac = new AbortController();
    const duplex = await connectNode({
      host: server.host,
      port: server.port,
      signal: ac.signal,
    });
    expect(duplex.readable).toBeDefined();
    expect(duplex.writable).toBeDefined();
    await duplex.close();
  });

  it("round-trips an MLLP message via MllpClient", async () => {
    const client = new MllpClient({
      connect: connectNode,
      host: server.host,
      port: server.port,
    });
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe("MSG001");
    await client.close();
  });
});

describe("connectNode — refused connections", () => {
  it("rejects when nothing is listening on the port", async () => {
    // Use an arbitrary high port unlikely to be in use.
    const ac = new AbortController();
    await expect(
      connectNode({
        host: "127.0.0.1",
        port: 1,
        signal: ac.signal,
      })
    ).rejects.toThrow();
  });
});

describe("connectNode — abort signal", () => {
  it("destroys the in-flight socket and rejects when signal aborts", async () => {
    // Use a host that takes a long time to connect (TEST-NET-1).
    // We abort before the OS can resolve / connect.
    const ac = new AbortController();
    const p = connectNode({
      host: "192.0.2.1",
      port: 65_535,
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 5);
    await expect(p).rejects.toThrow();
  });
});

describe("MllpDuplex contract — closed resolves on peer drop", () => {
  let server: ServerHandle;
  beforeEach(async () => {
    server = await startEchoAckServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("`closed` resolves when the server drops the socket", async () => {
    const duplex = await connectNode({
      host: server.host,
      port: server.port,
      signal: new AbortController().signal,
    });
    // Don't await `duplex.closed` until after we trigger the drop.
    const closedPromise = duplex.closed;
    server.dropAllSockets();
    // The duplex's closed Promise must resolve, not reject.
    await expect(closedPromise).resolves.toBeUndefined();
  });
});

describe("MllpDuplex contract — close() is idempotent and always resolves", () => {
  let server: ServerHandle;
  beforeEach(async () => {
    server = await startEchoAckServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("close() resolves on a fresh, never-used duplex", async () => {
    const duplex = await connectNode({
      host: server.host,
      port: server.port,
      signal: new AbortController().signal,
    });
    await expect(duplex.close()).resolves.toBeUndefined();
  });

  it("close() called three times all resolve, no EBADF", async () => {
    const duplex = await connectNode({
      host: server.host,
      port: server.port,
      signal: new AbortController().signal,
    });
    await Promise.all([duplex.close(), duplex.close(), duplex.close()]);
    expect(true).toBe(true);
  });

  it("close() resolves even after the peer has already dropped", async () => {
    const duplex = await connectNode({
      host: server.host,
      port: server.port,
      signal: new AbortController().signal,
    });
    server.dropAllSockets();
    await duplex.closed;
    await expect(duplex.close()).resolves.toBeUndefined();
  });
});

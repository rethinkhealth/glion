/**
 * Integration tests for the Node runtime adapter.
 *
 * Uses a real localhost `net.createServer` so the WHATWG-Streams →
 * Node `Duplex.toWeb` bridge is exercised. Each test pays a few ms for
 * socket setup, in exchange for verifying the live connection contract:
 * `close()` is idempotent and bounded, a pending read settles when the peer
 * drops, and signal cancellation destroys an in-flight socket.
 */

import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MllpClient } from "../src/index";
import type { MllpConnection } from "../src/index";
import { connectNode } from "../src/runtime/node";
import { ack, adtA01, controlIdOf } from "./fixtures";

interface RemoteSystem {
  readonly host: string;
  readonly port: number;
  /** Stop accepting and destroy any open sockets. */
  close(): Promise<void>;
  /** Destroy all currently open client sockets (simulate peer drop). */
  dropAllSockets(): void;
}

interface RemoteSystemOptions {
  /**
   * Called for each accepted socket. Default: acknowledge every frame
   * whenever the client sends a complete frame.
   */
  onConnection?: (socket: Socket) => void;
  /**
   * Keep the server's side open after receiving the client's FIN (Node
   * otherwise auto-ends). Used to exercise the adapter's grace destroy.
   */
  allowHalfOpen?: boolean;
}

async function remoteSystem(
  opts: RemoteSystemOptions = {}
): Promise<RemoteSystem> {
  const sockets = new Set<Socket>();
  const server: Server = createServer(
    { allowHalfOpen: opts.allowHalfOpen ?? false },
    (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      if (opts.onConnection) {
        opts.onConnection(socket);
        return;
      }
      // Default: acknowledge each frame for the message it carries. The tests
      // write one small frame per chunk, so a chunk is VT, message, FS, CR.
      socket.on("data", (chunk: Buffer) => {
        const message = chunk.toString("utf8").slice(1, -2);
        socket.write(frame(encodeBytes(ack("AA", controlIdOf(message)))));
      });
    }
  );

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

/**
 * Get the socket reading, then keep one read pending in the background so a
 * peer drop has something to settle. `ended` resolves once that read reports
 * end-of-stream or an error.
 *
 * `Duplex.toWeb` is pull-based: a socket nobody has read from stays paused,
 * and a paused socket never observes the peer's FIN. Writing a probe message
 * and reading the echo server's acknowledgment gets the socket flowing
 * deterministically before the caller drops the peer, instead of relying on
 * event-loop timing. This mirrors the client during a send, where a read is
 * pending; see #690 for the idle case.
 */
async function engageReadPump(
  connection: MllpConnection
): Promise<{ ended: Promise<void> }> {
  const writer = connection.writable.getWriter();
  await writer.write(frame(encodeBytes(adtA01())));
  writer.releaseLock();
  const reader = connection.readable.getReader();
  await reader.read();
  const ended = (async () => {
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) {
          return;
        }
      }
    } catch {
      // The reader rejects when the socket is destroyed mid-read — expected
      // on peer drop.
    }
  })();
  return { ended };
}

describe("connectNode — happy path", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("resolves to an MllpConnection when the remote accepts", async () => {
    const ac = new AbortController();
    const connection = await connectNode({
      host: remote.host,
      port: remote.port,
      signal: ac.signal,
    });
    expect(connection.readable).toBeDefined();
    expect(connection.writable).toBeDefined();
    await connection.close();
  });

  it("round-trips an MLLP message via MllpClient", async () => {
    const client = new MllpClient({
      connect: connectNode,
      host: remote.host,
      port: remote.port,
    });
    await client.connect();
    const message = adtA01();
    const response = await client.send(message);
    expect(response.code).toBe("AA");
    expect(response.raw).toContain(`MSA|AA|${controlIdOf(message)}`);
    await client.close();
  });
});

describe("connectNode — close contract", () => {
  it("close() after a send ends the socket gracefully, with FIN rather than RST", async () => {
    const seen: string[] = [];
    const remote = await remoteSystem({
      onConnection: (socket) => {
        socket.on("data", (chunk: Buffer) => {
          const message = chunk.toString("utf8").slice(1, -2);
          socket.write(frame(encodeBytes(ack("AA", controlIdOf(message)))));
        });
        socket.on("end", () => seen.push("end"));
        socket.on("error", () => seen.push("error"));
      },
    });
    try {
      const client = new MllpClient({
        connect: connectNode,
        host: remote.host,
        port: remote.port,
      });
      await client.send(adtA01());
      await client.close();
      await sleep(50);
      expect(seen).toEqual(["end"]);
    } finally {
      await remote.close();
    }
  });

  it("close() resolves via the grace destroy when the remote system never FINs back", async () => {
    // The adapter contract the whole client trusts: close() MUST resolve.
    // A peer that holds its side open after our FIN (allowHalfOpen, no
    // end()) would park a bare socket.end() forever — the 1 s grace window
    // must destroy and resolve.
    const remote = await remoteSystem({
      allowHalfOpen: true,
      onConnection: () => {
        // accept and hold: never respond, never end, never FIN back
      },
    });
    try {
      const ac = new AbortController();
      const connection = await connectNode({
        host: remote.host,
        port: remote.port,
        signal: ac.signal,
      });
      const started = performance.now();
      await connection.close();
      const elapsed = performance.now() - started;
      // The grace window ran (the peer withheld its FIN)…
      expect(elapsed).toBeGreaterThanOrEqual(900);
      // …and the destroy fired rather than parking forever.
      expect(elapsed).toBeLessThan(3000);
    } finally {
      await remote.close();
    }
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

describe("MllpConnection contract — readable ends when the peer drops", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("a pending read settles (end-of-stream or error) when the remote drops the socket", async () => {
    const connection = await connectNode({
      host: remote.host,
      port: remote.port,
      signal: new AbortController().signal,
    });
    const writer = connection.writable.getWriter();
    await writer.write(frame(encodeBytes(adtA01())));
    writer.releaseLock();
    const reader = connection.readable.getReader();
    await reader.read(); // the echo remote's ACK: the socket is now flowing
    const pending = reader.read();
    remote.dropAllSockets();
    // Either outcome satisfies the contract; what must not happen is a read
    // that never settles.
    await expect(
      pending.then(
        () => "settled",
        () => "settled"
      )
    ).resolves.toBe("settled");
    await connection.close();
  });
});

describe("MllpConnection contract — close() is idempotent and always resolves", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("close() resolves on a fresh, never-used connection", async () => {
    const connection = await connectNode({
      host: remote.host,
      port: remote.port,
      signal: new AbortController().signal,
    });
    await expect(connection.close()).resolves.toBeUndefined();
  });

  it("close() called three times all resolve, no EBADF", async () => {
    const connection = await connectNode({
      host: remote.host,
      port: remote.port,
      signal: new AbortController().signal,
    });
    const results = await Promise.all([
      connection.close(),
      connection.close(),
      connection.close(),
    ]);
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it("close() resolves even after the peer has already dropped", async () => {
    const connection = await connectNode({
      host: remote.host,
      port: remote.port,
      signal: new AbortController().signal,
    });
    // Engage the read pump so the pull-based socket observes the drop (see
    // engageReadPump), then wait until the read side has seen it end.
    const { ended } = await engageReadPump(connection);
    remote.dropAllSockets();
    await ended;
    await expect(connection.close()).resolves.toBeUndefined();
  });
});

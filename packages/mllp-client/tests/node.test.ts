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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MllpSession } from "../src/client/session";
import { createSession } from "../src/client/session";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
} from "../src/constants";
import { MllpClient, MllpErrorCode } from "../src/index";
import { nodeSocket } from "../src/runtime/node";
import type { MllpSocket } from "../src/types";
import { ack, adtA01, controlIdOf } from "./fixtures";

/** Long enough that only the remote system can settle an exchange. */
const NO_DEADLINE = 60_000;

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
        socket.write(
          frame(
            encodeBytes(ack("AA", { controlId: controlIdOf(message) }).text)
          )
        );
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
 * Opens a connection to `remote` over the real Node adapter, keeping the
 * socket so a test can assert on it directly.
 */
async function open(
  remote: RemoteSystem
): Promise<{ connection: MllpSession; socket: MllpSocket }> {
  const socket = nodeSocket({ host: remote.host, port: remote.port });
  const connection = createSession(socket, {
    maxBufferedBytes: DEFAULT_MAX_BUFFERED_BYTES,
    timeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
  });
  await connection.ready;
  return { connection, socket };
}

describe("nodeSocket — happy path", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("hands over both byte streams when the remote accepts", async () => {
    const socket = nodeSocket({ host: remote.host, port: remote.port });

    const streams = await socket.connect(new AbortController().signal);

    expect(streams.readable).toBeDefined();
    expect(streams.writable).toBeDefined();
    await socket.close();
  });

  it("round-trips an MLLP message via MllpClient", async () => {
    const client = new MllpClient({
      socket: nodeSocket({ host: remote.host, port: remote.port }),
    });
    await client.connect();
    const { controlId, tree } = adtA01();
    const response = await client.send(tree);
    expect(response.code).toBe("AA");
    expect(response.raw).toContain(`MSA|AA|${controlId}`);
    await client.close();
  });
});

describe("nodeSocket — close contract", () => {
  it("close() after a send ends the socket gracefully, with FIN rather than RST", async () => {
    const seen: string[] = [];
    const remote = await remoteSystem({
      onConnection: (socket) => {
        socket.on("data", (chunk: Buffer) => {
          const message = chunk.toString("utf8").slice(1, -2);
          socket.write(
            frame(
              encodeBytes(ack("AA", { controlId: controlIdOf(message) }).text)
            )
          );
        });
        socket.on("end", () => seen.push("end"));
        socket.on("error", () => seen.push("error"));
      },
    });
    try {
      const client = new MllpClient({
        socket: nodeSocket({ host: remote.host, port: remote.port }),
      });
      await client.send(adtA01().tree);
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
      const socket = nodeSocket({ host: remote.host, port: remote.port });
      await socket.connect(new AbortController().signal);
      const started = performance.now();
      await socket.close();
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

describe("nodeSocket — refused connections", () => {
  it("rejects when nothing is listening on the port", async () => {
    // Use an arbitrary high port unlikely to be in use.
    const ac = new AbortController();
    await expect(
      nodeSocket({ host: "127.0.0.1", port: 1 }).connect(ac.signal)
    ).rejects.toThrow();
  });
});

describe("nodeSocket — abort signal", () => {
  it("rejects with the reason the signal was aborted with", async () => {
    // TEST-NET-1 never answers, so the abort always wins the race.
    const ac = new AbortController();
    const reason = new Error("the caller gave up");
    const opening = nodeSocket({ host: "192.0.2.1", port: 65_535 }).connect(
      ac.signal
    );

    setTimeout(() => ac.abort(reason), 5);

    await expect(opening).rejects.toBe(reason);
  });

  it("rejects with the reason when the signal was already aborted", async () => {
    const reason = new Error("the caller gave up");

    await expect(
      nodeSocket({ host: "192.0.2.1", port: 65_535 }).connect(
        AbortSignal.abort(reason)
      )
    ).rejects.toBe(reason);
  });

  it("leaves nothing open, so close() resolves at once", async () => {
    const ac = new AbortController();
    const socket = nodeSocket({ host: "192.0.2.1", port: 65_535 });
    const opening = socket.connect(ac.signal);

    setTimeout(() => ac.abort(), 5);
    await expect(opening).rejects.toThrow();

    // No grace window to wait out: the attempt destroyed its socket.
    const started = performance.now();
    await socket.close();
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("MllpSession contract — readable ends when the peer drops", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("a pending exchange settles (end-of-stream or error) when the remote drops the socket", async () => {
    const { connection } = await open(remote);
    // `Duplex.toWeb` is pull-based: a socket nobody has read from stays
    // paused, and a paused socket never observes the peer's drop. One
    // completed exchange gets it flowing.
    await connection.exchange(encodeBytes(adtA01().text), NO_DEADLINE);
    remote.dropAllSockets();

    // Either outcome satisfies the contract; what must not happen is an
    // exchange that never settles.
    const pending = connection.exchange(
      encodeBytes(adtA01().text),
      NO_DEADLINE
    );
    await expect(
      pending.then(
        () => "settled",
        () => "settled"
      )
    ).resolves.toBe("settled");
    await connection.destroy();
  });
});

describe("MllpSession contract — close() is idempotent and always resolves", () => {
  let remote: RemoteSystem;
  beforeEach(async () => {
    remote = await remoteSystem();
  });
  afterEach(async () => {
    await remote.close();
  });

  it("close() resolves on a fresh, never-used socket", async () => {
    const socket = nodeSocket({ host: remote.host, port: remote.port });
    await socket.connect(new AbortController().signal);

    await expect(socket.close()).resolves.toBeUndefined();
  });

  it("close() called three times all resolve, no EBADF", async () => {
    const socket = nodeSocket({ host: remote.host, port: remote.port });
    await socket.connect(new AbortController().signal);
    const results = await Promise.all([
      socket.close(),
      socket.close(),
      socket.close(),
    ]);
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it("close() resolves even after the peer has already dropped", async () => {
    const { connection, socket } = await open(remote);
    // One completed exchange gets the pull-based socket flowing, so the next
    // one observes the drop rather than parking on a paused socket.
    await connection.exchange(encodeBytes(adtA01().text), NO_DEADLINE);
    remote.dropAllSockets();
    try {
      await connection.exchange(encodeBytes(adtA01().text), NO_DEADLINE);
    } catch {
      // The drop reaches the read side as an error; either way it has settled,
      // which is what close() is being asked to survive.
    }

    await expect(socket.close()).resolves.toBeUndefined();
  });
});

describe("MllpClient over nodeSocket — a dropped connection", () => {
  it("closes the client with CONNECTION_LOST; a new client dials a fresh socket", async () => {
    const remote = await remoteSystem();
    const socket = nodeSocket({ host: remote.host, port: remote.port });
    const client = new MllpClient({ socket });
    // A first exchange, so the remote system has accepted the socket it is
    // about to drop.
    await client.send(adtA01().tree);
    const closed = vi.fn();
    client.on("close", closed);

    remote.dropAllSockets();
    await sleep(10);
    // The drop is noticed by the next send, which fails and closes the client.
    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_LOST,
    });
    expect(client.state).toBe("closed");
    expect(closed).toHaveBeenCalledWith(
      expect.objectContaining({ code: MllpErrorCode.CONNECTION_LOST })
    );

    // The same adapter serves a new client.
    const next = new MllpClient({ socket });
    await expect(next.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });

    await next.close();
    await remote.close();
  });
});

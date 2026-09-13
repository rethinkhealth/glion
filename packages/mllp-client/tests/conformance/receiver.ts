/**
 * Loopback receivers, one per {@link ReceiverBehaviour}. Node only: a
 * receiver is a `net.Server` the test owns, whichever runtime hosts the
 * socket under test.
 *
 * @module
 */

import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

import { ack, controlIdOf } from "../fixtures";
import type { ReceiverBehaviour, RemoteAddress } from "./types";

/** TEST-NET-1 (RFC 5737): never routed, so a SYN there is never answered. */
const BLACKHOLE: RemoteAddress = { host: "192.0.2.1", port: 65_535 };

const SPLIT_DELAY_MS = 40;

export interface Receiver extends AsyncDisposable {
  readonly address: RemoteAddress;
  /** Connections accepted so far. */
  readonly connections: number;
  /** `end` and `error:<code>` as each accepted socket reported them. */
  readonly events: readonly string[];
  /** Destroys every open socket and stops listening. Idempotent. */
  close(): Promise<void>;
}

/** An acknowledgment for the message `chunk` carries, framed. */
function acknowledgment(chunk: Buffer, code: string, msa3 = ""): Uint8Array {
  const message = chunk.toString("utf8").slice(1, -2);
  return frame(
    encodeBytes(ack(code, { controlId: controlIdOf(message), msa3 }).text)
  );
}

/** Wires `socket` to behave as `behaviour`. */
function behave(socket: Socket, behaviour: ReceiverBehaviour): void {
  switch (behaviour) {
    case "acknowledges": {
      socket.on("data", (chunk: Buffer) => {
        socket.write(acknowledgment(chunk, "AA"));
      });
      return;
    }
    case "rejectsFirst": {
      let first = true;
      socket.on("data", (chunk: Buffer) => {
        socket.write(
          first
            ? acknowledgment(chunk, "AE", "Application error")
            : acknowledgment(chunk, "AA")
        );
        first = false;
      });
      return;
    }
    case "splitsAcknowledgment": {
      socket.on("data", (chunk: Buffer) => {
        const bytes = acknowledgment(chunk, "AA");
        const mid = Math.floor(bytes.length / 2);
        socket.write(bytes.subarray(0, mid));
        setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
      });
      return;
    }
    case "acknowledgesThenEnds": {
      socket.on("data", (chunk: Buffer) => {
        if (!socket.writableEnded) {
          socket.end(acknowledgment(chunk, "AA"));
        }
      });
      return;
    }
    case "endsAfterRead": {
      socket.on("data", () => socket.end());
      return;
    }
    case "dropsAfterRead": {
      socket.on("data", () => socket.destroy());
      return;
    }
    case "echoes": {
      socket.on("data", (chunk: Buffer) => {
        socket.write(chunk);
      });
      return;
    }
    case "silent":
    case "holdsOpen": {
      return;
    }
    case "refuses":
    case "blackhole": {
      throw new Error(`a "${behaviour}" receiver never accepts a connection`);
    }
  }
}

function listen(server: Server): Promise<RemoteAddress> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<RemoteAddress>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const { address: host, port } = server.address() as AddressInfo;
      resolve({ host, port });
    });
  });
}

function stop(server: Server): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

/** An address nothing listens on: a port the OS just released. */
async function releasedPort(): Promise<RemoteAddress> {
  const server = createServer();
  const address = await listen(server);
  await stop(server);
  return address;
}

/**
 * Starts a loopback receiver that behaves as `behaviour`, and resolves once
 * it is listening. `refuses` and `blackhole` start nothing and resolve with
 * an address that will not accept.
 */
export async function startReceiver(
  behaviour: ReceiverBehaviour
): Promise<Receiver> {
  const events: string[] = [];
  const sockets = new Set<Socket>();
  let connections = 0;
  let closing: Promise<void> | null = null;

  const listening = behaviour !== "refuses" && behaviour !== "blackhole";
  const server = createServer(
    { allowHalfOpen: behaviour === "holdsOpen" },
    (socket) => {
      connections += 1;
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("end", () => events.push("end"));
      socket.on("error", (error: NodeJS.ErrnoException) => {
        events.push(`error:${error.code ?? error.message}`);
      });
      behave(socket, behaviour);
    }
  );

  let address: RemoteAddress;
  if (behaviour === "blackhole") {
    address = BLACKHOLE;
  } else if (behaviour === "refuses") {
    address = await releasedPort();
  } else {
    address = await listen(server);
  }

  const close = (): Promise<void> => {
    closing ??= (async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      if (listening) {
        await stop(server);
      }
    })();
    return closing;
  };

  return {
    [Symbol.asyncDispose]: close,
    address,
    close,
    get connections() {
      return connections;
    },
    get events() {
      return events;
    },
  };
}

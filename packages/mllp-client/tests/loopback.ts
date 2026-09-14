/**
 * Loopback TCP receivers for tests that need a real socket at the far end.
 * Node only.
 *
 * @module
 */

import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";

import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

import { ack, controlIdOf } from "./fixtures";

export interface Address {
  readonly host: string;
  readonly port: number;
}

export interface ListenOptions {
  /** Wires one accepted socket. Default: accept and stay silent. */
  readonly onConnection?: (socket: Socket) => void;
  /** Keep this side open after the client's FIN. Default `false`. */
  readonly allowHalfOpen?: boolean;
}

export interface Listener extends Address, AsyncDisposable {
  /** Connections accepted so far. */
  readonly connections: number;
  /** How each accepted socket ended: `end`, or the error code it raised. */
  readonly closes: readonly string[];
  /** Destroys every open socket and stops listening. Idempotent. */
  close(): Promise<void>;
}

const SPLIT_DELAY_MS = 40;

/** An acknowledgment for the message `chunk` carries, framed. */
export function acknowledgment(
  chunk: Buffer,
  code = "AA",
  msa3 = ""
): Uint8Array {
  const message = chunk.toString("utf8").slice(1, -2);
  return frame(
    encodeBytes(ack(code, { controlId: controlIdOf(message), msa3 }).text)
  );
}

/** The receivers the conformance suites dial, by what each one does. */
export const peers = {
  /** Answers every message with `AA`. */
  acknowledges: {
    onConnection: (socket) => {
      socket.on("data", (chunk: Buffer) => {
        socket.write(acknowledgment(chunk));
      });
    },
  },
  /** Answers `AA` and sends FIN in the same write. */
  acknowledgesThenEnds: {
    onConnection: (socket) => {
      socket.on("data", (chunk: Buffer) => {
        if (!socket.writableEnded) {
          socket.end(acknowledgment(chunk));
        }
      });
    },
  },
  /** Reads one message, then resets the connection. */
  dropsAfterRead: {
    onConnection: (socket) => {
      socket.on("data", () => socket.destroy());
    },
  },
  /** Writes back every byte it reads. */
  echoes: {
    onConnection: (socket) => {
      socket.on("data", (chunk: Buffer) => {
        socket.write(chunk);
      });
    },
  },
  /** Reads one message, then sends FIN without answering. */
  endsAfterRead: {
    onConnection: (socket) => {
      socket.on("data", () => socket.end());
    },
  },
  /** Accepts, never writes, and never answers a FIN. */
  holdsOpen: { allowHalfOpen: true },
  /** Answers the first message with `AE`, every later one with `AA`. */
  rejectsFirst: {
    onConnection: (socket) => {
      let first = true;
      socket.on("data", (chunk: Buffer) => {
        socket.write(
          first
            ? acknowledgment(chunk, "AE", "Application error")
            : acknowledgment(chunk)
        );
        first = false;
      });
    },
  },
  /** Accepts and never writes. */
  silent: {},
  /** Answers `AA` in two writes 40 ms apart. */
  splitsAcknowledgment: {
    onConnection: (socket) => {
      socket.on("data", (chunk: Buffer) => {
        const bytes = acknowledgment(chunk);
        const mid = Math.floor(bytes.length / 2);
        socket.write(bytes.subarray(0, mid));
        setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
      });
    },
  },
} satisfies Record<string, ListenOptions>;

/** A receiver by behaviour, or `refused`: a port nothing listens on. */
export type Peer = keyof typeof peers | "refused";

export const peerNames = [
  ...(Object.keys(peers) as (keyof typeof peers)[]),
  "refused",
] as const satisfies readonly Peer[];

/** Starts a receiver on a loopback port the OS picks. */
export async function listen(options: ListenOptions = {}): Promise<Listener> {
  const sockets = new Set<Socket>();
  const closes: string[] = [];
  let connections = 0;
  let closed: Promise<void> | undefined;

  const server = createServer(
    { allowHalfOpen: options.allowHalfOpen ?? false },
    (socket) => {
      connections += 1;
      sockets.add(socket);
      // Without this, Nagle on this side and delayed ACK on the client's turn
      // a large echo into a stall per segment; MLLP servers disable it too.
      socket.setNoDelay(true);
      socket.on("close", () => sockets.delete(socket));
      socket.on("end", () => closes.push("end"));
      socket.on("error", (error: NodeJS.ErrnoException) => {
        closes.push(error.code ?? error.message);
      });
      options.onConnection?.(socket);
    }
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { address: host, port } = server.address() as AddressInfo;

  const close = (): Promise<void> => {
    closed ??= (async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
      await once(server, "close");
    })();
    return closed;
  };

  return {
    [Symbol.asyncDispose]: close,
    close,
    closes,
    get connections() {
      return connections;
    },
    host,
    port,
  };
}

/**
 * Starts the receiver `peer` names. `refused` is a listener that has
 * already closed, so its port refuses connections.
 */
export async function startPeer(peer: Peer): Promise<Listener> {
  if (peer === "refused") {
    const listener = await listen();
    await listener.close();
    return listener;
  }
  return await listen(peers[peer]);
}

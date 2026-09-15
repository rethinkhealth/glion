/**
 * A remote system over TCP: reads the frames a client writes and
 * answers each one through an `Answer`. Node only.
 *
 * @module
 */

import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { Readable } from "node:stream";

import { frame, unframe } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";

import { ack, controlIdOf } from "../fixtures";
import { acknowledging } from "../remote";

export interface Address {
  readonly host: string;
  readonly port: number;
}

/**
 * How the remote system answers one message: the text of a reply, framed on
 * the way out; raw bytes, sent as they are; or `undefined` for no reply.
 * `socket` is the connection the message arrived on.
 */
export type Answer = (
  message: string,
  socket: Socket
) => string | Uint8Array | undefined | Promise<string | Uint8Array | undefined>;

export interface ListenOptions {
  /** Default: acknowledges every message with `AA`. */
  readonly answer?: Answer;
  /** Keep this side open after the client's FIN. Default `false`. */
  readonly allowHalfOpen?: boolean;
}

export interface Remote extends Address, AsyncDisposable {
  /** Connections accepted so far. */
  readonly connections: number;
  /** How each accepted socket ended: `end`, or the error code it raised. */
  readonly closes: readonly string[];
  /** Every message received so far, as text, in order. */
  readonly received: readonly string[];
  /** Destroys every open socket and stops listening. Idempotent. */
  close(): Promise<void>;
}

/** The framed acknowledgment for `message`. */
export function acknowledgment(message: string, code = "AA"): Uint8Array {
  return frame(
    encodeBytes(ack(code, { controlId: controlIdOf(message) }).text)
  );
}

/** Answers the first message on each connection with `AE`, the rest with `AA`. */
export function rejectingFirst(): Answer {
  const rejected = new WeakSet<Socket>();
  return (message, socket) => {
    if (rejected.has(socket)) {
      return acknowledging("AA")(message);
    }
    rejected.add(socket);
    return acknowledging("AE", "Application error")(message);
  };
}

/** Starts a remote system on 127.0.0.1, on a port the OS picks. */
export async function listen(options: ListenOptions = {}): Promise<Remote> {
  const answer = options.answer ?? acknowledging("AA");
  const sockets = new Set<Socket>();
  const closes: string[] = [];
  const received: string[] = [];
  let connections = 0;
  let closed: Promise<void> | undefined;

  /** Reads and answers messages until the connection ends. */
  const serve = async (socket: Socket): Promise<void> => {
    const messages = Readable.toWeb(socket).pipeThrough(unframe());
    try {
      for await (const bytes of messages) {
        const message = decodeBytes(bytes);
        received.push(message);
        const reply = await answer(message, socket);
        if (reply !== undefined) {
          socket.write(
            typeof reply === "string" ? frame(encodeBytes(reply)) : reply
          );
        }
      }
    } catch {
      // The connection ended under the loop: a fault the answer asked for,
      // or the client dropping it. `closes` records how.
    }
  };

  const server = createServer(
    { allowHalfOpen: options.allowHalfOpen ?? false },
    (socket) => {
      connections += 1;
      sockets.add(socket);
      // MLLP servers disable Nagle; with it on, a large reply stalls once per
      // segment against the client's delayed ACK.
      socket.setNoDelay(true);
      socket.on("close", () => sockets.delete(socket));
      socket.on("end", () => closes.push("end"));
      socket.on("error", (error: NodeJS.ErrnoException) => {
        closes.push(error.code ?? error.message);
      });
      void serve(socket);
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
    received,
  };
}

/** An address nothing listens on: a port the OS just released. */
export async function released(): Promise<Address> {
  const remote = await listen();
  await remote.close();
  return { host: remote.host, port: remote.port };
}

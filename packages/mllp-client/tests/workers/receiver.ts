/**
 * A loopback receiver the test owns while the socket under test lives in
 * `workerd`.
 *
 * @module
 */

import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

import { ack, controlIdOf } from "../fixtures";

export interface ReceiverOptions {
  /** Wires one accepted socket. Default: accept and stay silent. */
  readonly onConnection?: (socket: Socket) => void;
  /** Keep this side open after the client's FIN. Default `false`. */
  readonly allowHalfOpen?: boolean;
}

export interface Receiver extends AsyncDisposable {
  readonly host: string;
  readonly port: number;
  /** Destroys every open socket and stops listening. Idempotent. */
  close(): Promise<void>;
}

/** An acknowledgment for the message `chunk` carries, framed. */
export function acknowledgment(
  chunk: Buffer,
  code: string,
  msa3 = ""
): Uint8Array {
  const message = chunk.toString("utf8").slice(1, -2);
  return frame(
    encodeBytes(ack(code, { controlId: controlIdOf(message), msa3 }).text)
  );
}

/** Starts a receiver on a loopback port the OS picks. */
export async function startReceiver(
  options: ReceiverOptions = {}
): Promise<Receiver> {
  const sockets = new Set<Socket>();
  let closing: Promise<void> | null = null;

  const server: Server = createServer(
    { allowHalfOpen: options.allowHalfOpen ?? false },
    (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {
        // The test tears the peer down mid-exchange on purpose; the
        // resulting ECONNRESET on this side is the scenario, not a failure.
      });
      options.onConnection?.(socket);
    }
  );

  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const { address: host, port } = server.address() as AddressInfo;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    })();
    return closing;
  };

  return { [Symbol.asyncDispose]: close, close, host, port };
}

/** An address nothing listens on: a port the OS just released. */
export async function releasedPort(): Promise<{ host: string; port: number }> {
  const receiver = await startReceiver();
  const { host, port } = receiver;
  await receiver.close();
  return { host, port };
}

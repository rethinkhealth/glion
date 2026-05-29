/**
 * Node runtime adapter for `MllpClient`.
 *
 * Wraps a Node `net.Socket` as an {@link MllpDuplex}. The adapter owns
 * the socket lifetime, honours the `MllpDuplex` contract
 * (`close()` resolves idempotently, `closed` resolves on either-side
 * teardown), and exposes the byte streams as Web Streams via
 * `Duplex.toWeb`.
 *
 * @module
 */

import { Socket } from "node:net";
import { Duplex } from "node:stream";

import type { MllpConnector, MllpDuplex } from "../index";

/**
 * Open a TCP connection and return an {@link MllpDuplex}.
 *
 * Respects `opts.signal`: aborting before connect resolves destroys
 * the in-flight socket and rejects.
 */
export const connectNode: MllpConnector = (opts) =>
  // oxlint-disable-next-line promise/avoid-new -- wrapping Node event emitter
  new Promise<MllpDuplex>((resolve, reject) => {
    const socket = new Socket();
    socket.setNoDelay(true);

    const cleanupOnSettle = () => {
      socket.removeListener("error", onError);
      socket.removeListener("connect", onConnect);
      opts.signal.removeEventListener("abort", onAbort);
    };

    const onError = (err: Error) => {
      cleanupOnSettle();
      if (!socket.destroyed) {
        socket.destroy();
      }
      reject(err);
    };

    const onAbort = () => {
      cleanupOnSettle();
      if (!socket.destroyed) {
        socket.destroy();
      }
      reject(
        opts.signal.reason instanceof Error
          ? opts.signal.reason
          : new Error("Connect aborted")
      );
    };

    const onConnect = () => {
      cleanupOnSettle();
      resolve(adaptSocket(socket));
    };

    if (opts.signal.aborted) {
      onAbort();
      return;
    }

    socket.once("error", onError);
    socket.once("connect", onConnect);
    opts.signal.addEventListener("abort", onAbort, { once: true });

    socket.connect(opts.port, opts.host);
  });

function adaptSocket(socket: Socket): MllpDuplex {
  const web = Duplex.toWeb(socket);
  const readable = web.readable as ReadableStream<Uint8Array>;
  const writable = web.writable as WritableStream<Uint8Array>;

  // oxlint-disable-next-line promise/avoid-new -- wrapping Node event emitter
  const closed = new Promise<void>((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
  });

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise !== null) {
      return closePromise;
    }
    // oxlint-disable-next-line promise/avoid-new -- wrapping Node event emitter
    closePromise = new Promise<void>((resolve) => {
      if (socket.destroyed) {
        resolve();
        return;
      }
      const finish = () => resolve();
      socket.once("close", finish);
      // `end()` triggers a graceful FIN; if the peer never closes we'd
      // wait forever, so we follow with `destroy()` to force a TCP RST
      // path. The "close" listener still fires for either path.
      try {
        socket.end();
      } catch {
        // ignore — fall through to destroy()
      }
      if (!socket.destroyed) {
        socket.destroy();
      }
    });
    return closePromise;
  };

  return { close, closed, readable, writable };
}

/**
 * Node runtime adapter for `MllpClient`.
 *
 * Opens a `net.Socket` and ends it the way Node expects — gracefully first,
 * then forced after a short grace period, so teardown always resolves in
 * bounded time. Framing and stream ownership belong to the layer above.
 *
 * @module
 */

import { Socket } from "node:net";
import { Duplex } from "node:stream";

import type { MllpSocket, MllpStreams } from "../types";

/** Default time a socket gets to end gracefully before it is destroyed. */
export const DEFAULT_GRACEFUL_CLOSE_MS = 1000;

/** Default idle time before the first keepalive probe. */
export const DEFAULT_KEEPALIVE_IDLE_MS = 30_000;

export interface NodeSocketOptions {
  /** Host name or address of the remote system. */
  readonly host: string;
  /** TCP port of the remote system. */
  readonly port: number;
  /**
   * Time a socket gets to end gracefully before it is destroyed, in
   * milliseconds.
   *
   * @default 1_000.
   */
  readonly gracefulCloseMs?: number;
  /**
   * Idle time before the first keepalive probe, in milliseconds. A silent NAT
   * or firewall drop surfaces after this rather than at the next send.
   *
   * @default 30_000.
   */
  readonly keepAliveIdleMs?: number;
}

/**
 * Dials one `net.Socket` and resolves it once the handshake completes.
 *
 * Rejects with the socket's error, or with `signal.reason` when cancelled.
 * Destroys the socket before rejecting.
 */
function dial(
  host: string,
  port: number,
  keepAliveIdleMs: number,
  signal: AbortSignal
): Promise<Socket> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<Socket>((resolve, reject) => {
    const socket = new Socket();
    // No Nagle — MLLP acknowledgments are tiny and latency-sensitive.
    socket.setNoDelay(true);
    socket.setKeepAlive(true, keepAliveIdleMs);

    const done = () => {
      socket.removeListener("error", onError);
      socket.removeListener("connect", onConnect);
      signal.removeEventListener("abort", onAbort);
    };
    const onError = (error: Error) => {
      done();
      socket.destroy();
      reject(error);
    };
    const onAbort = () => {
      done();
      socket.destroy();
      reject(signal.reason);
    };
    const onConnect = () => {
      done();
      resolve(socket);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    socket.once("error", onError);
    socket.once("connect", onConnect);
    signal.addEventListener("abort", onAbort, { once: true });
    socket.connect(port, host);
  });
}

/**
 * Ends a socket: FIN first, then destroy if the remote system does not answer.
 *
 * The grace window avoids the FIN-immediately-followed-by-RST sequence that
 * some integration engines log as a protocol error.
 */
function end(socket: Socket, gracefulCloseMs: number): Promise<void> {
  if (socket.destroyed || socket.closed) {
    return Promise.resolve();
  }
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<void>((resolve) => {
    const grace = setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }, gracefulCloseMs);
    socket.once("close", () => {
      clearTimeout(grace);
      // oxlint-disable-next-line promise/no-multiple-resolved -- `once`
      resolve();
    });
    socket.end();
  });
}

/**
 * A TCP socket to one remote system, over Node's `net` module.
 *
 * Each `connect()` dials a fresh `net.Socket`: Node cannot reconnect one that
 * has been destroyed.
 */
export function nodeSocket(opts: NodeSocketOptions): MllpSocket {
  const gracefulCloseMs = opts.gracefulCloseMs ?? DEFAULT_GRACEFUL_CLOSE_MS;
  const keepAliveIdleMs = opts.keepAliveIdleMs ?? DEFAULT_KEEPALIVE_IDLE_MS;
  /** Ends whatever `connect()` last opened. Nothing is open to begin with. */
  let teardown = (): Promise<void> => Promise.resolve();

  return {
    close: () => teardown(),

    async connect(signal: AbortSignal): Promise<MllpStreams> {
      const socket = await dial(opts.host, opts.port, keepAliveIdleMs, signal);
      teardown = () => end(socket, gracefulCloseMs);

      const web = Duplex.toWeb(socket);
      return {
        readable: web.readable as ReadableStream<Uint8Array>,
        writable: web.writable as WritableStream<Uint8Array>,
      };
    },
  };
}

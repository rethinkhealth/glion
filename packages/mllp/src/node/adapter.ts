/**
 * The Node.js TCP/TLS listener for the MLLP server.
 *
 * Listens with a Node.js `net.Server`, or a `tls.Server` when TLS options are
 * given, and wraps each accepted socket into a {@link NodeSocket}: the core's
 * Web Streams {@link MllpSocket} plus its TCP addresses. A reset, a broken
 * pipe or a timeout errors the readable with `CONNECTION_LOST`.
 *
 * This module is internal to the `@glion/mllp` package and
 * is consumed by {@link serve} in `./serve.ts`.
 *
 * @module
 */

import { once } from "node:events";
import type { Server, ServerOpts, Socket } from "node:net";
import { createServer } from "node:net";
import { createServer as createTlsServer } from "node:tls";
import type { TlsOptions } from "node:tls";
import { promisify } from "node:util";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import type { MllpSocket } from "../server/connection";

/** An accepted Node.js socket, with its TCP addresses. */
export interface NodeSocket extends MllpSocket {
  readonly remoteAddress: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly secure: boolean;
}

/** A Node.js server listening for MLLP connections. */
export interface Listener {
  /** The port the server is listening on. */
  readonly port: number;
  /** Resolves when the server has bound and started listening. */
  readonly listening: Promise<void>;
  /** Stops accepting connections. Resolves once the server has closed. */
  close(): Promise<void>;
}

/**
 * Options for {@link listen}.
 *
 * @internal
 */
export interface ListenOptions {
  port: number;
  hostname?: string;
  /** Set as the listener's `server.maxConnections`. */
  maxConnections?: number;

  /**
   * Socket inactivity timeout in milliseconds.
   *
   * When set to a value greater than `0`, sockets that remain idle for
   * longer than this duration are automatically destroyed. Set to `0`
   * (the default) to disable idle timeouts entirely.
   *
   * @default 0
   */
  socketTimeout?: number;

  /**
   * Options for `tls.createServer()`, over {@link SOCKET_OPTIONS}. Without
   * it, the adapter listens with `net.createServer()`.
   */
  tls?: TlsOptions;
}

/**
 * Socket options every listener is created with, which `tls` can replace:
 * keep-alive probes after 60 s idle, and Nagle's algorithm off.
 */
const SOCKET_OPTIONS = {
  keepAlive: true,
  keepAliveInitialDelay: 60_000,
  noDelay: true,
} as const satisfies ServerOpts;

/**
 * The server's side stays open after the remote system closes its own, until
 * every message it sent is answered. `tls` cannot replace it.
 */
const HALF_OPEN = { allowHalfOpen: true } as const satisfies ServerOpts;

/** Time a socket gets to close after its FIN before it is destroyed. */
const CLOSE_GRACE_MS = 1000;

/**
 * Error codes of a socket the remote system, the network or a timeout has
 * already torn down. Each ends the connection as `CONNECTION_LOST`.
 */
const TEARDOWN_CODES = new Set([
  // A write in flight when the idle timeout destroys the socket.
  "ECANCELED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  // Bun's code for a socket that is already closed.
  "ERR_SOCKET_CLOSED",
  "ERR_STREAM_DESTROYED",
  "ERR_STREAM_WRITE_AFTER_END",
  // Keep-alive probes that the remote system never answered.
  "ETIMEDOUT",
]);

function isTeardown(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    TEARDOWN_CODES.has(String(error.code))
  );
}

/**
 * Writes `chunk` to `socket`, and resolves once it has been handed to the
 * operating system, or once the socket turns out to be torn down.
 */
async function writeToSocket(socket: Socket, chunk: Uint8Array): Promise<void> {
  const written = Promise.withResolvers<Error | null | undefined>();
  // Bun never calls back a write still pending when the socket is reset.
  const closed = () => written.resolve(null);
  socket.once("close", closed);
  socket.write(chunk, written.resolve);
  const error = await written.promise;
  socket.off("close", closed);
  if (error && !isTeardown(error)) {
    throw error;
  }
}

/**
 * The bytes `socket` receives. Ends when the remote system closes its side,
 * and errors with `CONNECTION_LOST` when the socket is torn down.
 */
function readFromSocket(socket: Socket): ReadableStream<Uint8Array> {
  let open = true;
  return new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
      socket.destroy();
    },
    pull() {
      socket.resume();
    },
    start(controller) {
      const end = (error?: Error) => {
        if (!open) {
          return;
        }
        open = false;
        if (error) {
          controller.error(error);
        } else {
          controller.close();
        }
      };
      const lost = (cause?: Error) =>
        end(
          new MllpServerError(MllpServerErrorCode.CONNECTION_LOST, { cause })
        );
      socket.on("data", (chunk: Uint8Array) => {
        if (!open) {
          return;
        }
        controller.enqueue(chunk);
        if ((controller.desiredSize ?? 0) <= 0) {
          socket.pause();
        }
      });
      socket.once("end", () => end());
      // A TLS socket can emit a second error after its first.
      socket.on("error", (error: Error) =>
        isTeardown(error) ? lost(error) : end(error)
      );
      // A close with no end before it is a teardown.
      socket.once("close", () => lost());
    },
  });
}

/**
 * Wrap a Node.js `net.Socket` into a {@link NodeSocket}.
 *
 * @param socket - The raw Node.js socket to wrap.
 * @param secure - Whether this socket was accepted over TLS.
 * @returns A {@link NodeSocket} exposing Web Streams and connection
 * metadata.
 */
function wrapNodeSocket(socket: Socket, secure: boolean): NodeSocket {
  const readable = readFromSocket(socket);
  const writable = new WritableStream<Uint8Array>({
    abort() {
      socket.destroy();
    },
    close() {
      socket.end();
    },
    async write(chunk) {
      await writeToSocket(socket, chunk);
    },
  });

  return {
    close() {
      if (socket.writableEnded || socket.destroyed) {
        return;
      }
      // Graceful teardown: `resume()` drains any unread inbound bytes so the
      // following `end()` can send a clean FIN. A bare `destroy()` while data
      // sits unread in the RX buffer (e.g. tearing down after `onConnect`
      // rejects, before the peer's first frame is consumed) makes the kernel
      // send an RST, surfacing as ECONNRESET on the peer. The bytes are
      // dropped: the readable's `data` listener would pause the socket again.
      socket.removeAllListeners("data");
      socket.resume();
      // A remote system that never closes its side would hold the socket open.
      const grace = setTimeout(() => socket.destroy(), CLOSE_GRACE_MS);
      socket.once("close", () => clearTimeout(grace));
      socket.end();
    },
    get localPort() {
      return socket.localPort ?? 0;
    },
    readable,
    get remoteAddress() {
      return socket.remoteAddress ?? "unknown";
    },
    get remotePort() {
      return socket.remotePort ?? 0;
    },
    secure,
    writable,
  };
}

/**
 * Listen with `tls.createServer()` when `options.tls` is set, and with
 * `net.createServer()` otherwise, both with {@link SOCKET_OPTIONS} and
 * {@link HALF_OPEN}, and pass
 * every accepted socket to `onSocket` as a {@link NodeSocket}. A TLS socket is
 * passed on once its TLS handshake completes.
 *
 * @param options - Bind address, idle timeout, and TLS.
 * @param onSocket - Called with each accepted socket.
 * @returns The {@link Listener}.
 * @internal
 */
export function listen(
  options: ListenOptions,
  onSocket: (socket: NodeSocket) => void
): Listener {
  const { hostname, maxConnections, port, socketTimeout = 0, tls } = options;

  /**
   * Apply the idle timeout to an accepted connection: if `socketTimeout > 0`,
   * sets `setTimeout()` and destroys the socket on the `"timeout"` event.
   *
   * @param socket - The raw Node.js socket to configure.
   */
  function configureSocket(socket: Socket): void {
    if (socketTimeout > 0) {
      socket.setTimeout(socketTimeout);
      socket.on("timeout", () => socket.destroy());
    }
  }

  const secure = tls !== undefined;
  const onConnection = (socket: Socket) => {
    configureSocket(socket);
    onSocket(wrapNodeSocket(socket, secure));
  };

  const server: Server = secure
    ? createTlsServer({ ...SOCKET_OPTIONS, ...tls, ...HALF_OPEN }, onConnection)
    : createServer({ ...SOCKET_OPTIONS, ...HALF_OPEN }, onConnection);
  if (maxConnections !== undefined) {
    server.maxConnections = maxConnections;
  }

  const listening = (async () => {
    await once(server, "listening");
  })();
  // An error before `listening` rejects it; a later one is kept from crashing
  // the process as an unhandled emitter error.
  let listenFailed = false;
  server.on("error", () => {
    if (!listenFailed) {
      listenFailed = true;
      // Close the server handle so the OS descriptor is released
      // even if the caller never awaits `listening` again.
      server.close();
    }
  });

  server.listen(port, hostname);

  const closeServer = promisify(server.close.bind(server));

  return {
    async close() {
      await closeServer();
    },
    listening,
    get port() {
      const addr = server.address();
      return addr && typeof addr === "object" ? addr.port : port;
    },
  };
}

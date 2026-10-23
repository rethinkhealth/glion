/**
 * The Node.js TCP/TLS listener for the MLLP server.
 *
 * Listens with a Node.js `net.Server`, or a `tls.Server` when TLS options are
 * given, and wraps each accepted socket into a {@link NodeSocket}: the core's
 * Web Streams {@link MllpSocket} plus its TCP addresses.
 *
 * This module is internal to the `@glion/mllp` package and
 * is consumed by {@link serve} in `./serve.ts`.
 *
 * @module
 */

import { once } from "node:events";
import type { Server, ServerOpts, Socket } from "node:net";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { createServer as createTlsServer } from "node:tls";
import type { TlsOptions } from "node:tls";
import { promisify } from "node:util";

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
 * Socket options every listener is created with: keep-alive probes after
 * 60 s idle, and Nagle's algorithm off.
 */
const SOCKET_OPTIONS = {
  keepAlive: true,
  keepAliveInitialDelay: 60_000,
  noDelay: true,
} as const satisfies ServerOpts;

/** Time a socket gets to close after its FIN before it is destroyed. */
const CLOSE_GRACE_MS = 1000;

/**
 * Write a chunk to a Node.js socket, waiting for backpressure to clear.
 *
 * `socket.write()` returns `false` when the internal buffer is full,
 * indicating that the caller should wait for the `"drain"` event before
 * writing again. This helper wraps that pattern in a promise so it can
 * be used with `await`.
 *
 * @param socket - The Node.js TCP socket to write to.
 * @param chunk - The bytes to write.
 * @returns A promise that resolves once the chunk has been flushed or the
 *   socket's internal buffer has drained.
 */
async function writeToSocket(socket: Socket, chunk: Uint8Array): Promise<void> {
  const ok = socket.write(chunk);
  if (!ok) {
    await once(socket, "drain");
  }
}

/**
 * Wrap a Node.js `net.Socket` into a {@link NodeSocket}.
 *
 * The readable side is created via `Readable.toWeb()` which converts the
 * Node.js stream into a WHATWG `ReadableStream<Uint8Array>`. The writable
 * side is a custom `WritableStream` that delegates writes to
 * {@link writeToSocket} and handles `close` / `abort` by ending or
 * destroying the underlying socket.
 *
 * @param socket - The raw Node.js socket to wrap.
 * @param secure - Whether this socket was accepted over TLS.
 * @returns A {@link NodeSocket} exposing Web Streams and connection
 * metadata.
 */
function wrapNodeSocket(socket: Socket, secure: boolean): NodeSocket {
  const readable = Readable.toWeb(socket) as ReadableStream<Uint8Array>;

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
      // send an RST, surfacing as ECONNRESET on the peer.
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
 * `net.createServer()` otherwise, both with {@link SOCKET_OPTIONS}, and pass
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
    ? createTlsServer({ ...SOCKET_OPTIONS, ...tls }, onConnection)
    : createServer(SOCKET_OPTIONS, onConnection);
  if (maxConnections !== undefined) {
    server.maxConnections = maxConnections;
  }

  let resolveListening!: (value: true) => void;
  let rejectListening!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new -- Node 18 compat (no Promise.withResolvers)
  const listeningInternal = new Promise<true>((resolve, reject) => {
    resolveListening = resolve;
    rejectListening = reject;
  });
  // Public type is Promise<void>; the sentinel return value is an
  // implementation detail never observed by consumers.
  const listening = listeningInternal as Promise<unknown> as Promise<void>;

  server.once("listening", () => {
    resolveListening(true);
  });
  // Persistent error listener: server errors that fire before
  // `listening` reject the startup promise; later errors (TLS,
  // shutdown) propagate via the already-returned handle's lifecycle
  // rather than crashing the process via an unhandled emitter error.
  let listenFailed = false;
  server.on("error", (err) => {
    if (!listenFailed) {
      listenFailed = true;
      rejectListening(err);
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

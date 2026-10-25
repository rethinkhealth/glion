/**
 * Node.js TCP/TLS adapter for the MLLP server.
 *
 * Implements the {@link TcpAdapter} interface over a Node.js `net.Server`, or a
 * `tls.Server` when TLS options are given. Accepted sockets are wrapped into
 * Web Streams-based {@link AdapterSocket} objects so that the rest of the MLLP
 * stack can work with a platform-agnostic streaming API.
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

import type {
  AdapterSocket,
  ConnectionHandler,
  ListenOptions,
  TcpAdapter,
  TcpHandle,
} from "../server/adapter";

/**
 * Options specific to the Node.js adapter.
 *
 * @internal
 */
export interface NodeAdapterOptions {
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
 * Wrap a Node.js `net.Socket` into a platform-agnostic {@link AdapterSocket}.
 *
 * The readable side is created via `Readable.toWeb()` which converts the
 * Node.js stream into a WHATWG `ReadableStream<Uint8Array>`. The writable
 * side is a custom `WritableStream` that delegates writes to
 * {@link writeToSocket} and handles `close` / `abort` by ending or
 * destroying the underlying socket.
 *
 * @param socket - The raw Node.js socket to wrap.
 * @param secure - Whether this socket was accepted over TLS.
 * @returns An {@link AdapterSocket} exposing Web Streams and connection
 *   metadata.
 */
function wrapNodeSocket(socket: Socket, secure: boolean): AdapterSocket {
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
 * Create a Node.js {@link TcpAdapter} that listens with `tls.createServer()`
 * when `tls` is set, and with `net.createServer()` otherwise, both with
 * {@link SOCKET_OPTIONS}. A TLS socket is handed on once its TLS handshake
 * completes.
 *
 * Each accepted socket gets the idle timeout via {@link configureSocket} and
 * is wrapped into an {@link AdapterSocket} before being handed to the
 * provided {@link ConnectionHandler}.
 *
 * @example
 *   ```typescript
 *   const adapter = nodeAdapter({ socketTimeout: 30_000 });
 *   const handle = adapter.listen({ port: 2575 }, (socket) => {
 *     // handle connection
 *   });
 *   ```;
 *
 * @param options - Optional listener and socket configuration.
 * @returns A {@link TcpAdapter} ready to bind to a port.
 * @internal
 */
export function nodeAdapter(options?: NodeAdapterOptions): TcpAdapter {
  const { socketTimeout = 0, tls } = options ?? {};

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

  return {
    listen(listenOpts: ListenOptions, handler: ConnectionHandler): TcpHandle {
      const secure = tls !== undefined;
      const onConnection = (socket: Socket) => {
        configureSocket(socket);
        handler(wrapNodeSocket(socket, secure));
      };

      const server: Server = secure
        ? createTlsServer({ ...SOCKET_OPTIONS, ...tls }, onConnection)
        : createServer(SOCKET_OPTIONS, onConnection);

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

      server.listen(listenOpts.port, listenOpts.hostname, listenOpts.backlog);

      const closeServer = promisify(server.close.bind(server));

      return {
        async close() {
          await closeServer();
        },
        listening,
        get port() {
          const addr = server.address();
          return addr && typeof addr === "object" ? addr.port : listenOpts.port;
        },
      };
    },
  };
}

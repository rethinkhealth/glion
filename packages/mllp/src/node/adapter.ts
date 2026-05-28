/**
 * Node.js TCP/TLS adapter for the MLLP server.
 *
 * Implements the {@link TcpAdapter} interface using Node.js built-in
 * `net` and `tls` modules. Incoming `net.Socket` instances are wrapped
 * into Web Streams-based {@link AdapterSocket} objects so that the rest
 * of the MLLP stack can work with a platform-agnostic streaming API.
 *
 * This module is internal to the `@glion/mllp` package and
 * is consumed by {@link serve} in `./serve.ts`.
 *
 * @module
 */

import { once } from "node:events";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { createServer as createTlsServer } from "node:tls";
import { promisify } from "node:util";

import type {
  AdapterSocket,
  ConnectionHandler,
  ListenOptions,
  TcpAdapter,
  TcpHandle,
} from "../server/adapter";

/**
 * Options specific to the Node.js adapter that control per-socket behaviour.
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
   * Whether to enable TCP keep-alive probes on accepted sockets.
   *
   * When `true` the operating system will periodically send keep-alive
   * packets to detect dead peers and prevent intermediate network
   * equipment from dropping idle connections.
   *
   * @default true
   */
  keepAlive?: boolean;

  /**
   * The initial delay in milliseconds before the first TCP keep-alive
   * probe is sent on an idle socket. Only meaningful when
   * {@link keepAlive} is `true`.
   *
   * @default 60000
   */
  keepAliveInitialDelay?: number;
}

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
      socket.destroy();
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
 * Create a Node.js {@link TcpAdapter} that can listen for TCP or TLS
 * connections using the built-in `net` and `tls` modules.
 *
 * When the returned adapter's `listen()` method is called with a `tls`
 * option, a TLS server (`tls.createServer`) is used; otherwise a plain
 * TCP server (`net.createServer`) is created.
 *
 * Each accepted socket is configured via {@link configureSocket} (timeouts,
 * keep-alive, Nagle disabled) and then wrapped into an {@link AdapterSocket}
 * before being handed to the provided {@link ConnectionHandler}.
 *
 * @example
 *   ```typescript
 *   const adapter = nodeAdapter({ socketTimeout: 30_000 });
 *   const handle = adapter.listen({ port: 2575 }, (socket) => {
 *     // handle connection
 *   });
 *   ```;
 *
 * @param options - Optional per-socket configuration (timeouts, keep-alive).
 * @returns A {@link TcpAdapter} ready to bind to a port.
 * @internal
 */
export function nodeAdapter(options?: NodeAdapterOptions): TcpAdapter {
  const {
    socketTimeout = 0,
    keepAlive = true,
    keepAliveInitialDelay = 60_000,
  } = options ?? {};

  /**
   * Apply common socket options to an accepted connection.
   *
   * Configures the following on the raw `net.Socket`:
   *
   * - **Idle timeout** -- If `socketTimeout > 0`, sets `setTimeout()` and
   *   destroys the socket on the `"timeout"` event.
   * - **TCP keep-alive** -- Enables keep-alive probes with the configured initial
   *   delay when `keepAlive` is `true`.
   * - **Nagle disabled** -- Calls `setNoDelay(true)` so that small MLLP frames
   *   are sent immediately without buffering.
   *
   * @param socket - The raw Node.js socket to configure.
   */
  function configureSocket(socket: Socket): void {
    if (socketTimeout > 0) {
      socket.setTimeout(socketTimeout);
      socket.on("timeout", () => socket.destroy());
    }
    if (keepAlive) {
      socket.setKeepAlive(true, keepAliveInitialDelay);
    }
    socket.setNoDelay(true);
  }

  return {
    listen(listenOpts: ListenOptions, handler: ConnectionHandler): TcpHandle {
      const onConnection = (socket: Socket) => {
        configureSocket(socket);
        const secure = !!listenOpts.tls;
        handler(wrapNodeSocket(socket, secure));
      };

      const server: Server = listenOpts.tls
        ? createTlsServer(
            {
              ca: listenOpts.tls.ca,
              cert: listenOpts.tls.cert,
              key: listenOpts.tls.key,
              passphrase: listenOpts.tls.passphrase,
            },
            onConnection
          )
        : createServer(onConnection);

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

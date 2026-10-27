/**
 * Node.js MLLP server entry point.
 *
 * Listens on a TCP (or TLS) port with the Node.js `net` / `tls` modules and
 * runs {@link handleConnection} on every connection it accepts, with the
 * connection in `env`.
 *
 * @module
 */

import type { TlsOptions } from "node:tls";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { handleConnection } from "../server/connection";
import type { Response } from "../server/types";
import { listen } from "./adapter";
import type { NodeSocket } from "./adapter";

const MAX_PORT = 65_535;

/** Monotonically-increasing connection ID counter. */
// oxlint-disable-next-line prefer-const
let nextConnectionId = 1;

/** A connection the server has accepted. */
export interface ConnectionInfo {
  readonly id: number;
  readonly remoteAddress: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly secure: boolean;
  /** State kept across the messages of this connection. */
  readonly state: Map<string, unknown>;
}

/**
 * What {@link serve} passes to `handle()` with each message: `ctx.env` of an
 * `Mllp<NodeEnv>`.
 */
export interface NodeEnv {
  /** The connection the message arrived on. */
  readonly connection: ConnectionInfo;
}

/**
 * Lifecycle callback invoked for connection events.
 */
export type ConnectionCallback = (
  connection: ConnectionInfo
) => void | Promise<void>;

/**
 * Error callback invoked with an error on a connection: a throwing
 * `onConnect` or `onDisconnect`, an error `handle` rejects with
 * ({@link MllpServerError} `NO_PARSER`), a broken MLLP byte stream
 * (`PROTOCOL_VIOLATION`), or a socket error other than a reset, a broken pipe
 * or a timeout. The connection closes after any of the last three. Any other
 * error a message raises is answered by the app and never reaches this
 * callback.
 */
export type ErrorCallback = (
  error: Error,
  connection: ConnectionInfo
) => void | Promise<void>;

/**
 * Options for starting an MLLP server with {@link serve}.
 */
export interface ServeOptions {
  /**
   * Replies to each message: an app's `handle`. Called with the message
   * without MLLP framing, and the {@link NodeEnv} of its connection.
   */
  handle: (payload: Uint8Array, env: NodeEnv) => Promise<Response | undefined>;

  /**
   * The hostname or IP address to bind the server to.
   * When omitted the OS will bind to all available interfaces (`0.0.0.0`).
   */
  hostname?: string;

  /**
   * The most connections the server holds open at once, set as Node's
   * `server.maxConnections`. A connection past it is closed as soon as it
   * is accepted, before any message is read; an open connection is never
   * closed to make room. Unlimited when unset.
   */
  maxConnections?: number;

  /**
   * Called when a new TCP connection is accepted. Receives the connection
   * metadata including the unique connection ID and mutable state map.
   *
   * If this callback throws, the connection is torn down and
   * `onDisconnect` is still called.
   */
  onConnect?: ConnectionCallback;

  /**
   * Called when a TCP connection is closed (including force-close).
   * Always fires, even if `onConnect` threw.
   *
   * If this callback throws, the error is passed to `onError`.
   */
  onDisconnect?: ConnectionCallback;

  /**
   * Called with an error on a connection; see {@link ErrorCallback}.
   * Without it, those errors are not reported. MUST NOT throw.
   */
  onError?: ErrorCallback;

  /**
   * The TCP port number to listen on.
   */
  port: number;

  /**
   * Socket inactivity timeout in milliseconds. A socket that has been idle
   * for longer than this value will be destroyed. Set to `0` (the default)
   * to disable the timeout.
   */
  socketTimeout?: number;

  /**
   * TLS for the listener, passed to `tls.createServer()` unchanged. Without
   * it, the server listens on plain TCP.
   */
  tls?: TlsOptions;
}

/**
 * A running MLLP server handle returned by {@link serve}.
 */
export interface Server {
  /** The port the server is currently listening on. */
  readonly port: number;

  /**
   * Resolves when the underlying TCP server has bound and started listening.
   * Await this before attempting to connect to ensure the port is ready.
   */
  readonly listening: Promise<void>;

  /**
   * Gracefully close the server. No new connections are accepted, and every
   * open connection is ended once the message it is handling, if any, has
   * been answered. Resolves once every connection has closed.
   */
  close(): Promise<void>;
}

/**
 * Start an MLLP server bound to a TCP (or TLS) port.
 *
 * @example
 *   ```typescript
 *   import { Mllp } from "@glion/mllp";
 *   import { serve } from "@glion/mllp/node";
 *
 *   const app = new Mllp().parser(parseHL7v2).on("ADT^A01", async (ctx) => {
 *     await save(await ctx.result()); // replies AA
 *   });
 *
 *   const server = serve({ handle: app.handle, port: 2575 });
 *   await server.listening;
 *   ```;
 *
 * @param options - The handler, port, TLS, limits, timeouts, and callbacks.
 * @returns A {@link Server} handle that exposes the bound port and a `close()`
 *   method for graceful shutdown.
 * @throws {MllpServerError} `INVALID_OPTION` when `handle` is not a function,
 *   or `port` is not an integer from 0 to 65535.
 */
export function serve(options: ServeOptions): Server {
  const {
    handle,
    hostname,
    maxConnections,
    onConnect,
    onDisconnect,
    onError,
    port,
    socketTimeout,
    tls,
  } = options;
  if (typeof handle !== "function") {
    throw new MllpServerError(MllpServerErrorCode.INVALID_OPTION, {
      option: "handle",
    });
  }
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
    throw new MllpServerError(MllpServerErrorCode.INVALID_OPTION, {
      option: "port",
    });
  }
  const shutdown = new AbortController();
  const connections = new Set<Promise<void>>();

  /** Runs one connection; resolves once `onDisconnect` has settled. */
  const run = async (socket: NodeSocket): Promise<void> => {
    const connection: ConnectionInfo = Object.freeze({
      id: nextConnectionId++,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      secure: socket.secure,
      state: new Map(),
    });
    const env: NodeEnv = { connection };
    try {
      await onConnect?.(connection);
      await handleConnection((payload) => handle(payload, env), socket, {
        signal: shutdown.signal,
      });
    } catch (error) {
      await onError?.(toError(error), connection);
    } finally {
      // Ends the socket when onConnect threw; idempotent otherwise.
      socket.close();
      try {
        await onDisconnect?.(connection);
      } catch (disconnectError) {
        await onError?.(toError(disconnectError), connection);
      }
    }
  };

  /** Lists a connection among the open ones until it has closed. */
  const track = async (closed: Promise<void>) => {
    connections.add(closed);
    await closed;
    connections.delete(closed);
  };

  const listener = listen(
    { hostname, maxConnections, port, socketTimeout, tls },
    (socket) => {
      // A TLS connection can finish its handshake after `close()` started.
      if (shutdown.signal.aborted) {
        socket.close();
        return;
      }
      // oxlint-disable-next-line no-void
      void track(run(socket));
    }
  );

  return {
    async close() {
      shutdown.abort();
      await listener.close();
      await Promise.all(connections);
    },
    listening: listener.listening,
    get port() {
      return listener.port;
    },
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

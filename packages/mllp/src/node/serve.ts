/**
 * Node.js MLLP server entry point.
 *
 * Binds an {@link Mllp} application to a TCP (or TLS) socket using the
 * Node.js `net` / `tls` modules. Incoming bytes are decoded from the MLLP
 * framing protocol, dispatched through the application's middleware stack,
 * and the resulting acknowledgements are encoded and written back to the
 * client.
 *
 * @module
 */

import type { TlsOptions } from "node:tls";

import { frame, MllpCodecError, unframe } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import type { AdapterSocket } from "../server/adapter";
import type { Mllp } from "../server/mllp";
import type { ConnectionInfo } from "../server/types";
import { nodeAdapter } from "./adapter";

/** Monotonically-increasing connection ID counter. */
// oxlint-disable-next-line prefer-const
let nextConnectionId = 1;

/**
 * Lifecycle callback invoked for connection events.
 */
export type ConnectionCallback = (
  connection: ConnectionInfo
) => void | Promise<void>;

/**
 * Error callback invoked with an error on a connection: a throwing
 * `onConnect` or `onDisconnect`, an error `app.handle()` rejects with (a
 * message handled before a parser is registered, {@link MllpServerError}
 * `NO_PARSER`; a second middleware error; a `next()` called twice), or a
 * broken MLLP byte stream (`PROTOCOL_VIOLATION`). Any other error a message
 * raises is answered by the app and never reaches this callback.
 * Stream-level errors (connection reset) do not trigger it.
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
   * If this callback throws, the error is routed to `onError`
   * (or `console.error` as last resort).
   */
  onDisconnect?: ConnectionCallback;

  /**
   * Called with an error on a connection; see {@link ErrorCallback}.
   *
   * Only logs `error.message` and connection ID to avoid leaking PHI
   * in the `console.error` fallback. Production deployments should
   * always provide this callback.
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
 * The server accepts incoming connections, decodes MLLP-framed HL7v2
 * messages, passes them through the provided {@link Mllp} application, and
 * writes back any response (typically an ACK/NAK) using MLLP framing.
 *
 * @example
 *   ```typescript
 *   import { Mllp } from "@glion/mllp";
 *   import { parseHL7v2 } from "@glion/hl7v2";
 *   import { serve } from "@glion/mllp/node";
 *
 *   const app = new Mllp()
 *   .parser(parseHL7v2)
 *   .on("ADT^A01", async (ctx) => ({ raw: "..." }));
 *
 *   const server = serve(app, { port: 2575 });
 *   console.log(`Listening on port ${server.port}`);
 *   ```
 *
 * @param app - The {@link Mllp} application that will handle each message.
 * @param options - Server configuration: port, TLS, limits, timeouts, and
 *   callbacks.
 * @returns A {@link Server} handle that exposes the bound port and a `close()`
 *   method for graceful shutdown.
 */
export function serve(app: Mllp, options: ServeOptions): Server {
  const adapter = nodeAdapter({
    maxConnections: options.maxConnections,
    socketTimeout: options.socketTimeout,
    tls: options.tls,
  });

  const lifecycle: LifecycleOptions = {
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  };

  const connections = new Set<OpenConnection>();
  let closing = false;

  /** Lists `connection` among the open connections until it has closed. */
  const track = async (connection: OpenConnection) => {
    connections.add(connection);
    await connection.closed;
    connections.delete(connection);
  };

  const handle = adapter.listen(
    {
      hostname: options.hostname,
      port: options.port,
    },
    (socket) => {
      // A TLS connection can finish its handshake after `close()` started.
      if (closing) {
        socket.close();
        return;
      }
      // oxlint-disable-next-line no-void
      void track(handleConnection(app, socket, lifecycle));
    }
  );

  return {
    async close() {
      closing = true;
      for (const connection of connections) {
        connection.end();
      }
      await handle.close();
      await Promise.all([...connections].map(({ closed }) => closed));
    },
    listening: handle.listening,
    get port() {
      return handle.port;
    },
  };
}

/** A connection the server has accepted. */
interface OpenConnection {
  /**
   * Ends the connection once the message in progress, if any, has been
   * answered. A message read after `end()` is not handled. Idempotent.
   */
  end(): void;

  /**
   * Resolves once the connection has closed and `onDisconnect` has settled.
   * Never rejects.
   */
  readonly closed: Promise<void>;
}

/** Lifecycle callback options extracted from ServeOptions. */
interface LifecycleOptions {
  onConnect?: ConnectionCallback;
  onDisconnect?: ConnectionCallback;
  onError?: ErrorCallback;
}

/**
 * Route an error to the `onError` callback, falling back to a safe
 * `console.error` that logs only the error message and connection ID
 * to avoid leaking PHI from HL7v2 message content.
 */
async function reportError(
  error: unknown,
  connection: ConnectionInfo,
  lifecycle: LifecycleOptions
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    if (lifecycle.onError) {
      await lifecycle.onError(err, connection);
    } else {
      // Safe fallback: only message + connection ID, no PHI
      console.error(
        `[mllp] Unhandled error on connection ${connection.id}: ${err.message}`
      );
    }
  } catch {
    // onError itself threw — last resort
    console.error(
      `[mllp] Unhandled error on connection ${connection.id}: ${err.message}`
    );
  }
}

/**
 * Handle a single MLLP connection.
 *
 * Sets up a decode-handle-encode loop for the lifetime of the socket:
 *
 * 1. **Decode** — Raw bytes from the socket's readable stream are piped through an
 *    MLLP decoder (`TransformStream`) that strips the MLLP start/end block
 *    characters and emits complete HL7v2 messages.
 * 2. **Handle** — Each decoded message is passed to the {@link Mllp} application
 *    which runs its middleware stack and returns an optional response (e.g. an
 *    ACK or NAK).
 * 3. **Encode** — If the application produced a response, the raw response bytes
 *    are MLLP-encoded (wrapped in start/end block characters) and written back
 *    to the socket.
 *
 * The loop runs until the remote end closes the connection, an
 * unrecoverable error occurs, or {@link OpenConnection.end} is called. Stream
 * locks are released in a `finally` block to prevent resource leaks.
 *
 * Lifecycle callbacks fire at connection boundaries:
 *
 * - `onConnect` after the connection is established
 * - `onDisconnect` when the connection closes (always fires)
 * - `onError` when a lifecycle callback throws, no parser is registered, or the
 *   byte stream breaks
 *
 * @param app - The MLLP application to dispatch messages to.
 * @param socket - The adapter socket wrapping the underlying TCP connection.
 * @param lifecycle - Optional lifecycle callbacks from ServeOptions.
 * @returns The connection, to end it and to wait for it to close.
 */
function handleConnection(
  app: Mllp,
  socket: AdapterSocket,
  lifecycle: LifecycleOptions
): OpenConnection {
  const reader = socket.readable.pipeThrough(unframe()).getReader();
  const writer = socket.writable.getWriter();

  let handling = false;
  let ending = false;
  const end = () => {
    ending = true;
    // Mid-message, the loop ends the socket once the reply is written.
    if (!handling) {
      socket.close();
    }
  };

  const connection: ConnectionInfo = {
    id: nextConnectionId++,
    localPort: socket.localPort,
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
    secure: socket.secure,
    state: new Map(),
  };

  const processMessages = async () => {
    try {
      // ── onConnect ──────────────────────────────────────────────────
      try {
        await lifecycle.onConnect?.(connection);
      } catch (connectError) {
        await reportError(connectError, connection, lifecycle);
        // Tear down — onDisconnect still fires in the outer finally
        return;
      }

      // ── Message loop ───────────────────────────────────────────────
      try {
        while (true) {
          const { done, value: payload } = await reader.read();
          if (done || ending) {
            break;
          }
          handling = true;

          // A handle() rejection leaves the message unanswered; the
          // connection survives it.
          // Stream errors (connection reset) flow to the outer catch.
          let response: Awaited<ReturnType<Mllp["handle"]>>;
          try {
            response = await app.handle(payload, connection);
          } catch (handleError) {
            await reportError(handleError, connection, lifecycle);
          }

          // Write is outside the handler error catch — write failures
          // are transport errors and flow to the outer catch.
          if (response) {
            await writer.write(frame(encodeBytes(response.raw)));
          }
          handling = false;
          if (ending) {
            break;
          }
        }
      } catch (streamError) {
        // A codec error is a protocol violation, not plumbing — the remote
        // system broke MLLP framing, or a handler's response carried a
        // reserved VT/FS byte and could not be framed. The server is never
        // silent about it: translate (never leak the codec's own type) and
        // route to onError; the connection still closes below — framing
        // violations are terminal. Everything else here is transport-level
        // (connection reset, stream teardown) and stays unrouted: that is
        // infrastructure, not an application error.
        if (streamError instanceof MllpCodecError) {
          await reportError(
            new MllpServerError(
              MllpServerErrorCode.PROTOCOL_VIOLATION,
              "The MLLP byte stream was violated and the connection is closing (see the error's cause).",
              { cause: streamError }
            ),
            connection,
            lifecycle
          );
        }
      }
    } finally {
      // ── Cleanup & onDisconnect ─────────────────────────────────────
      // Always runs, even if onConnect threw.
      reader.releaseLock();
      writer.releaseLock();

      try {
        await lifecycle.onDisconnect?.(connection);
      } catch (disconnectError) {
        await reportError(disconnectError, connection, lifecycle);
      }

      socket.close();
    }
  };

  return { closed: processMessages(), end };
}

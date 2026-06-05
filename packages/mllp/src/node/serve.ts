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

import { FramingError, frame, FrameDecoderStream } from "@glion/mllp-transport";

import type { AdapterSocket } from "../server/adapter";
import type { MessageInfo, Mllp } from "../server/mllp";
import { getMessageInfo } from "../server/mllp";
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
 * The single transport error channel for {@link serve}. Most handlers just log
 * `error`; the extra arguments let you tell the layers apart when you care:
 *
 * - **Server-scoped** error (post-listen; a bind error rejects `server.listening`
 *   instead) → `connection` is `undefined`. The server keeps serving.
 * - **Protocol/framing** error (malformed/oversized envelope) → `error instanceof
 *   FramingError` (read `error.code`); the connection is torn down with **no
 *   NAK** (no message boundary to acknowledge). `FRAME_TOO_LARGE` is a
 *   denial-of-service signal.
 * - **Escaped-core** error on a connection (a throwing
 *   `onConnect`/`onDisconnect`/`app.onError`, or `NO_PARSER`) → `connection` is
 *   set and `messageInfo` carries the routing fields when available.
 *
 * Semantic errors (handler/middleware throws, decode/parse failures) are
 * **not** here — the core turns them into a NAK. Routine connection drops
 * (ECONNRESET, idle timeout) are not surfaced either; they are not actionable.
 * The fallback (no callback) logs a PHI-safe one-liner: the message or typed
 * framing code and the connection ID, never message content.
 */
export type ErrorCallback = (
  error: Error,
  connection?: ConnectionInfo,
  messageInfo?: MessageInfo
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
   * Whether to enable TCP keep-alive on accepted sockets.
   * Defaults to the adapter default (`true`).
   */
  keepAlive?: boolean;

  /**
   * The initial delay in milliseconds before the first TCP keep-alive probe
   * is sent on an idle socket. Only meaningful when `keepAlive` is `true`.
   * Defaults to the adapter default (`60 000`).
   */
  keepAliveInitialDelay?: number;

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
   * The single **transport error** channel — see {@link ErrorCallback}. Just
   * log `error`, or tell the layers apart: `connection` is `undefined` for a
   * server-scoped error, `error instanceof FramingError` for a malformed
   * envelope, otherwise it is an escaped-core error (with `messageInfo` when
   * available). Semantic errors (handler/decode/parse) are NAK'd by the core
   * and do not reach here; observe those with a logger middleware. Production
   * deployments should always provide this callback.
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
   *
   * This is the single connection-stuck deadline: besides idle inactivity it
   * also bounds a write whose buffer never drains (a stalled peer), so a slow
   * receiver can't hang the connection's message loop indefinitely.
   */
  socketTimeout?: number;

  /**
   * TLS configuration. When provided the server will create a TLS socket
   * instead of a plain TCP socket.
   */
  tls?: {
    /** Optional CA certificate(s) for client certificate verification. */
    ca?: string | Buffer;
    /** The server certificate. */
    cert: string | Buffer;
    /** The private key for the server certificate. */
    key: string | Buffer;
    /** Optional passphrase for the private key. */
    passphrase?: string;
  };
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
   * Gracefully close the server. No new connections will be accepted and the
   * returned promise resolves once all underlying resources are released.
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
 * @param options - Server configuration (port, TLS, timeouts, etc.).
 * @returns A {@link Server} handle that exposes the bound port and a `close()`
 *   method for graceful shutdown.
 */
export function serve(app: Mllp, options: ServeOptions): Server {
  const adapter = nodeAdapter({
    keepAlive: options.keepAlive,
    keepAliveInitialDelay: options.keepAliveInitialDelay,
    socketTimeout: options.socketTimeout,
  });

  const lifecycle: LifecycleOptions = {
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  };

  const handle = adapter.listen(
    {
      hostname: options.hostname,
      // A server-scoped error has no connection — reportError treats an absent
      // connection as server-scoped. It is self-handling and never rejects, so
      // fire-and-forget from the adapter's synchronous handler.
      onError: (err) => {
        // oxlint-disable-next-line no-void
        void reportError(err, options.onError);
      },
      port: options.port,
      tls: options.tls,
    },
    (socket) => handleConnection(app, socket, lifecycle)
  );

  return {
    async close() {
      await handle.close();
    },
    listening: handle.listening,
    get port() {
      return handle.port;
    },
  };
}

/** Lifecycle callback options extracted from ServeOptions. */
interface LifecycleOptions {
  onConnect?: ConnectionCallback;
  onDisconnect?: ConnectionCallback;
  onError?: ErrorCallback;
}

/** Normalize an unknown thrown value to an `Error`. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** PHI-safe one-line fallback when no `onError` is registered (or it threw). */
function logErrorFallback(error: Error, connection?: ConnectionInfo): void {
  if (error instanceof FramingError) {
    console.warn(
      `[mllp] Framing error (${error.code}) on connection ${connection?.id}`
    );
  } else if (connection) {
    console.error(
      `[mllp] Unhandled error on connection ${connection.id}: ${error.message}`
    );
  } else {
    console.error(`[mllp] Server error: ${error.message}`);
  }
}

/**
 * Route a transport error to the single `onError` callback, falling back to a
 * PHI-safe one-line `console` log (only the message / typed code and the
 * connection ID — never HL7v2 message content). A `connection` of `undefined`
 * marks a server-scoped error.
 */
async function reportError(
  error: Error,
  onError: ErrorCallback | undefined,
  connection?: ConnectionInfo,
  messageInfo?: MessageInfo
): Promise<void> {
  if (onError) {
    try {
      await onError(error, connection, messageInfo);
      return;
    } catch {
      // onError itself threw — fall through to the console fallback.
    }
  }
  logErrorFallback(error, connection);
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
 * The loop runs until the remote end closes the connection or an
 * unrecoverable error occurs. Stream locks are released in a `finally`
 * block to prevent resource leaks.
 *
 * Lifecycle callbacks fire at connection boundaries:
 *
 * - `onConnect` after the connection is established
 * - `onDisconnect` when the connection closes (always fires)
 * - `onError` for errors that escape the core (a throwing lifecycle callback or
 *   `app.onError`, or a missing parser) — not semantic handler/decode errors,
 *   which the core turns into a NAK
 *
 * @param app - The MLLP application to dispatch messages to.
 * @param socket - The adapter socket wrapping the underlying TCP connection.
 * @param lifecycle - Optional lifecycle callbacks from ServeOptions.
 */
function handleConnection(
  app: Mllp,
  socket: AdapterSocket,
  lifecycle: LifecycleOptions
): void {
  const decoder = new FrameDecoderStream();
  const reader = socket.readable.pipeThrough(decoder).getReader();
  const writer = socket.writable.getWriter();

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
        await reportError(toError(connectError), lifecycle.onError, connection);
        // Tear down — onDisconnect still fires in the outer finally
        return;
      }

      // ── Message loop ───────────────────────────────────────────────
      try {
        while (true) {
          const { done, value: payload } = await reader.read();
          if (done) {
            break;
          }

          // Inner try/catch separates per-message errors from stream errors.
          // Semantic errors (decode/parse/handler) never reach this catch —
          // the core turns them into a (default or middleware) NAK returned
          // below. Only errors that escape the core (a throwing app.onError,
          // or NO_PARSER) land here; the connection survives. Stream errors
          // (connection reset) flow to the outer catch for cleanup.
          let response: Awaited<ReturnType<Mllp["handle"]>>;
          try {
            // Pass the de-framed payload bytes straight to the core. handle()
            // owns decode + parse (runtime-agnostic) and never throws on a
            // bad-charset/unparseable payload — those return a NAK.
            response = await app.handle(payload, connection);
          } catch (messageError) {
            // An error that escaped the core (throwing onError, or NO_PARSER):
            // report it to the transport hook; the connection survives.
            const error = toError(messageError);
            await reportError(
              error,
              lifecycle.onError,
              connection,
              getMessageInfo(error)
            );
            continue;
          }

          // Write is outside the handler error catch — write failures
          // are transport errors and flow to the outer catch.
          if (response) {
            await writer.write(frame(response.raw));
          }
        }
      } catch (streamError) {
        // Transport-level — the connection is torn down either way. A
        // FramingError (malformed/oversized MLLP envelope) can't be NAK'd
        // (no message boundary), but it MUST be observable, so surface it.
        // Routine drops (ECONNRESET, socket teardown) stay silent — not
        // application errors, and not actionable.
        if (streamError instanceof FramingError) {
          await reportError(streamError, lifecycle.onError, connection);
        }
      }
    } finally {
      // ── Cleanup & onDisconnect ─────────────────────────────────────
      // Always runs, even if onConnect threw.
      try {
        reader.releaseLock();
      } catch {
        /* lock may already be released */
      }
      try {
        writer.releaseLock();
      } catch {
        /* lock may already be released */
      }

      try {
        await lifecycle.onDisconnect?.(connection);
      } catch (disconnectError) {
        await reportError(
          toError(disconnectError),
          lifecycle.onError,
          connection
        );
      }

      socket.close();
    }
  };

  // oxlint-disable-next-line no-void
  void processMessages();
}

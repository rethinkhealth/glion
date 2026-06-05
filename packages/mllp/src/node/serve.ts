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
 * Error callback invoked when a message handler error is unhandled.
 * Receives the error and the connection it occurred on.
 *
 * This is a **transport/lifecycle** hook, not the application error channel.
 * Semantic errors — a handler/middleware throw, or a decode/parse failure —
 * are handled inside the core: they become a NAK (the default floor, an ack
 * middleware, or `app.onError`) and never reach here. This callback fires only
 * for errors that escape the core back to the transport:
 *
 * - A lifecycle callback (`onConnect`/`onDisconnect`) threw, or
 * - The app's `onError` handler itself threw, or
 * - The server has no parser registered (`NO_PARSER`).
 *
 * `messageInfo` carries the routing fields (messageType, triggerEvent,
 * controlId, version) when the escaping error came from message processing;
 * it is `undefined` for lifecycle callback errors. Stream-level errors
 * (connection reset) do not trigger this callback.
 */
export type ErrorCallback = (
  error: Error,
  connection: ConnectionInfo,
  messageInfo: MessageInfo | undefined
) => void | Promise<void>;

/**
 * Callback for a **protocol/framing** error — a malformed or oversized MLLP
 * envelope (missing start/end block, or `FRAME_TOO_LARGE`). Per the MLLP spec a
 * framing error cannot be NAK'd (there is no reliable message boundary or
 * control id to echo), so the connection is torn down — but it MUST be
 * observable, so it is surfaced here with the typed `code` and the connection.
 *
 * Only the error `code` and connection metadata are exposed, never the
 * offending bytes — a malformed frame may still contain PHI. `FRAME_TOO_LARGE`
 * in particular is a denial-of-service signal an operator should monitor.
 */
export type FramingErrorCallback = (
  error: FramingError,
  connection: ConnectionInfo
) => void | Promise<void>;

/**
 * Callback for a **server-scoped** error that fires after the server is
 * listening (a startup/bind error rejects the `listening` promise instead).
 * The server keeps serving; this is an observability hook. Distinct from the
 * per-connection {@link ErrorCallback}.
 */
export type ServerErrorCallback = (error: Error) => void | Promise<void>;

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
   * Called for **transport/lifecycle** errors that escape the core — a
   * throwing `onConnect`/`onDisconnect`, a throwing `app.onError`, or a
   * missing parser. Semantic errors (handler/decode/parse) are NAK'd by the
   * core and do not reach here; observe those with a logger middleware.
   *
   * Only logs `error.message` and connection ID to avoid leaking PHI
   * in the `console.error` fallback. Production deployments should
   * always provide this callback.
   */
  onError?: ErrorCallback;

  /**
   * Called for a **protocol/framing** error (malformed or oversized MLLP
   * envelope). The connection is torn down without a NAK (spec-mandated — no
   * message boundary to acknowledge), but the error is surfaced here so framing
   * faults and `FRAME_TOO_LARGE` flood attempts are not silently dropped.
   * Without a callback, a PHI-safe one-line `console.warn` is emitted.
   */
  onFramingError?: FramingErrorCallback;

  /**
   * Called for a **server-scoped** error after the server is listening (a
   * startup/bind error rejects the `listening` promise instead). The server
   * keeps serving. Without a callback, a PHI-safe one-line `console.error`
   * is emitted.
   */
  onServerError?: ServerErrorCallback;

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
   * Deadline in milliseconds for a single write to flush when the socket send
   * buffer is full. A stalled peer that never drains would otherwise hang the
   * connection's message loop indefinitely. On expiry the socket is destroyed.
   * Set to `0` to wait indefinitely.
   *
   * @default 30000
   */
  writeTimeout?: number;

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
    writeTimeout: options.writeTimeout,
  });

  const lifecycle: LifecycleOptions = {
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
    onFramingError: options.onFramingError,
  };

  const handle = adapter.listen(
    {
      hostname: options.hostname,
      onServerError: (err) => {
        // reportServerError is async (it may await a user callback) but the
        // adapter calls this synchronously; it is self-handling and never
        // rejects, so fire-and-forget.
        // oxlint-disable-next-line no-void
        void reportServerError(err, options.onServerError);
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
  onFramingError?: FramingErrorCallback;
}

/**
 * Route an error to the `onError` callback, falling back to a safe
 * `console.error` that logs only the error message and connection ID
 * to avoid leaking PHI from HL7v2 message content.
 */
async function reportError(
  error: unknown,
  connection: ConnectionInfo,
  lifecycle: LifecycleOptions,
  messageInfo?: MessageInfo
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    if (lifecycle.onError) {
      await lifecycle.onError(err, connection, messageInfo);
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
 * Surface a protocol/framing error. PHI-safe: only the typed `code` and
 * connection ID are exposed, never the offending bytes. Falls back to a
 * one-line `console.warn` so framing faults are never silently dropped.
 */
async function reportFramingError(
  error: FramingError,
  connection: ConnectionInfo,
  lifecycle: LifecycleOptions
): Promise<void> {
  try {
    if (lifecycle.onFramingError) {
      await lifecycle.onFramingError(error, connection);
    } else {
      console.warn(
        `[mllp] Framing error (${error.code}) on connection ${connection.id}`
      );
    }
  } catch {
    console.warn(
      `[mllp] Framing error (${error.code}) on connection ${connection.id}`
    );
  }
}

/**
 * Surface a server-scoped (post-listen) error. PHI-safe: server-level errors
 * carry no message content. Falls back to a one-line `console.error`.
 */
async function reportServerError(
  error: Error,
  onServerError: ServerErrorCallback | undefined
): Promise<void> {
  try {
    if (onServerError) {
      await onServerError(error);
    } else {
      console.error(`[mllp] Server error: ${error.message}`);
    }
  } catch {
    // onServerError itself threw — last resort
    console.error(`[mllp] Server error: ${error.message}`);
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
        await reportError(connectError, connection, lifecycle);
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
            const error =
              messageError instanceof Error
                ? messageError
                : new Error(String(messageError));
            await reportError(
              error,
              connection,
              lifecycle,
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
          await reportFramingError(streamError, connection, lifecycle);
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
        await reportError(disconnectError, connection, lifecycle);
      }

      socket.close();
    }
  };

  // oxlint-disable-next-line no-void
  void processMessages();
}

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

import { frame, MllpCodecError, unframe } from "@glion/mllp-codec";
import { CharsetError, decodeBytes, encodeBytes } from "@glion/util-charset";

import { MllpServerError, MllpServerErrorCode } from "../errors";
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
 * For handler errors, `messageInfo` contains the routing fields
 * (messageType, triggerEvent, controlId, version) of the message that
 * caused the error — useful for audit logging in healthcare contexts.
 * For lifecycle callback errors (onConnect/onDisconnect), `messageInfo`
 * is `undefined`.
 *
 * This fires for application-level errors (handler/middleware throws with no
 * app-level error handler, or the app-level error handler itself throws) and
 * for a server-level failure decoding an inbound message — surfaced as an
 * {@link MllpServerError} (`code` `INCOMPATIBLE_CHARSET`), never the codec's
 * own error. Stream-level errors (connection reset) do not trigger this
 * callback.
 */
export type ErrorCallback = (
  error: Error,
  connection: ConnectionInfo,
  messageInfo: MessageInfo | undefined
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
   * Called when a message handler error is unhandled — either no app-level
   * error handler is registered, or the app-level error handler itself
   * threw. Also called when lifecycle callbacks (`onConnect`,
   * `onDisconnect`) throw.
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
 * - `onError` when a handler error is unhandled (not for transport errors)
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
  const reader = socket.readable.pipeThrough(unframe()).getReader();
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
          // Decode failures and handler errors both route to onError and the
          // connection survives; stream errors (connection reset) flow to the
          // outer catch for cleanup.
          let response: Awaited<ReturnType<Mllp["handle"]>>;
          try {
            // unframe() emits the de-framed payload bytes; decode them to
            // text (UTF-8) for the handler, which also receives the raw bytes.
            // A non-UTF-8 feed throws here rather than being silently corrupted.
            const text = decodeBytes(payload);
            response = await app.handle(text, payload, connection);
          } catch (messageError) {
            // A decode failure is the server's own error — translated into an
            // MllpServerError so we never leak the codec's CharsetError to
            // onError (the CharsetError is kept on `cause`). A handler/middleware
            // throw is the consumer's own error and passes through unchanged.
            // The connection survives either way.
            const error =
              messageError instanceof CharsetError
                ? new MllpServerError(
                    MllpServerErrorCode.INCOMPATIBLE_CHARSET,
                    "The inbound message is not valid UTF-8; only UTF-8 is supported.",
                    { cause: messageError }
                  )
                : messageError;
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
            await writer.write(frame(encodeBytes(response.raw)));
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

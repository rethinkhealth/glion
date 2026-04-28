/**
 * Cloudflare Workers runtime adapter for `@glion/mllp-client`.
 *
 * Re-exports the core `MllpClient` pre-wired with a `connect`
 * implementation that uses the `cloudflare:sockets` API. Application
 * code on Workers imports from this entry:
 *
 * ```ts
 * import { MllpClient } from "@glion/mllp-client/workers";
 *
 * const client = new MllpClient({ host: "127.0.0.1", port: 2575 });
 * const ack = await client.send(rawHl7Message);
 * ```
 *
 * The `cloudflare:sockets` module is only available inside the
 * Workers (`workerd`) runtime. Importing this entry from a Node or
 * Deno build will fail at module-resolution time — that's the
 * intended behaviour, since each runtime should pick its own
 * adapter.
 *
 * @module
 */

// `cloudflare:sockets` is a runtime-provided module — its shape is
// declared in `./cloudflare-sockets.d.ts`. See that file for why we
// do not use `@cloudflare/workers-types` (it pollutes Web Streams
// globals project-wide, which breaks the Node adapter's
// `node:stream/web` types).
import { connect as workerSocketConnect } from "cloudflare:sockets";

import { MllpClient as CoreMllpClient } from "../core/client";
import type {
  BoundMllpClientOptions,
  MllpClientOptions,
  MllpClientTlsOptions,
} from "../core/client";
import type { MllpConnect, MllpDuplexStream } from "../core/connect";
import { MllpClientError, MllpClientErrorCode } from "../core/errors";
import { subscribeAbort } from "../core/internal/subscribe-abort";

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * MLLP client pre-wired with the Cloudflare Workers connector.
 * API-identical to the core class — the only difference is that
 * callers do not need to supply `connect`.
 */
export class MllpClient extends CoreMllpClient {
  constructor(options: BoundMllpClientOptions) {
    super({ ...options, connect: workersConnect });
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Acknowledgment } from "../core/acknowledgment";
export type {
  MllpConnect,
  MllpConnectParams,
  MllpDuplexStream,
} from "../core/connect";
export type {
  BoundMllpClientOptions,
  MllpClientOptions,
  MllpClientTlsOptions,
  SendOptions,
} from "../core/client";
export { MllpClientError, MllpClientErrorCode } from "../core/errors";

// ---------------------------------------------------------------------------
// Workers connector
// ---------------------------------------------------------------------------

/**
 * `MllpConnect` implementation backed by Cloudflare's
 * `cloudflare:sockets` module. Returns a {@link MllpDuplexStream} that
 * mirrors the Worker socket's already-Web-Streams shape.
 *
 * TLS is opt-in via `tls` on the params; the Workers runtime accepts
 * a small subset of TLS options compared to Node — `ca`, `cert`,
 * `key`, and `passphrase` cannot be supplied programmatically. When
 * `insecure: true` is set, `secureTransport` stays off so the
 * connection runs as plain TCP and the caller takes the security
 * trade-off explicitly.
 */
export const workersConnect: MllpConnect = async (params) => {
  rejectUnsupportedTlsMaterial(params.tls);

  const useTls = params.tls !== undefined && params.tls.insecure !== true;
  const socket = workerSocketConnect(
    { hostname: params.host, port: params.port },
    {
      allowHalfOpen: true,
      secureTransport: useTls ? "on" : "off",
    }
  );

  // Honour the caller's abort signal — when it fires we close the
  // pending socket so `socket.opened` rejects with the abort.
  const dispose = params.signal
    ? subscribeAbort(params.signal, () => {
        // oxlint-disable-next-line no-void
        void closeWorkerSocketIgnoringErrors(socket);
      })
    : noop;

  try {
    // Wait for the socket to be ready (Workers' way of signalling
    // connect/handshake completion).
    await socket.opened;
  } catch (error) {
    if (params.signal?.aborted) {
      throw toAbortError(params.signal.reason, params.host, params.port, error);
    }
    throw new MllpClientError(
      MllpClientErrorCode.CONNECTION_REFUSED,
      `Could not connect to ${params.host}:${params.port}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error instanceof Error ? error : undefined }
    );
  } finally {
    dispose();
  }

  const duplex: MllpDuplexStream = {
    close: () => socket.close(),
    readable: socket.readable,
    writable: socket.writable,
  };
  return duplex;
};

/** No-op disposer used when no abort signal was supplied. */
function noop(): void {
  /* nothing to dispose */
}

/**
 * Translate an abort `reason` from the connect-phase signal into a typed
 * {@link MllpClientError}. Mirrors the precedence in `normaliseSendError` in
 * `core/client.ts`: typed reasons pass through, anything else maps to TIMEOUT
 * with the reason chained as `cause`.
 */
function toAbortError(
  reason: unknown,
  host: string,
  port: number,
  fallbackCause: unknown
): MllpClientError {
  if (reason instanceof MllpClientError) {
    return reason;
  }
  return new MllpClientError(
    MllpClientErrorCode.TIMEOUT,
    `Connect to ${host}:${port} aborted`,
    { cause: pickError(reason, fallbackCause) }
  );
}

/**
 * Reject TLS configuration the Workers runtime cannot honour.
 * Surfacing the mismatch as `INVALID_INPUT` is more honest than
 * silently dropping the material — operators who supply a custom CA,
 * client cert, key, or passphrase expect it to take effect.
 */
function rejectUnsupportedTlsMaterial(
  tls: MllpClientTlsOptions | undefined
): void {
  if (!tls) {
    return;
  }
  if (tls.ca || tls.cert || tls.key) {
    throw new MllpClientError(
      MllpClientErrorCode.INVALID_INPUT,
      "Cloudflare Workers does not support custom CA/cert/key — use the platform's TLS configuration instead"
    );
  }
  if (tls.passphrase !== undefined) {
    throw new MllpClientError(
      MllpClientErrorCode.INVALID_INPUT,
      "Cloudflare Workers does not support an inline TLS passphrase — encrypted private keys are not configurable from the runtime"
    );
  }
}

/**
 * Close a Workers socket without leaking unhandled rejections. Called
 * from the abort handler where any close error is non-actionable —
 * the awaiter on `socket.opened` will surface the abort as TIMEOUT
 * regardless of how close itself behaves.
 */
async function closeWorkerSocketIgnoringErrors(
  socket: ReturnType<typeof workerSocketConnect>
): Promise<void> {
  try {
    await socket.close();
  } catch {
    /* socket may already be torn down */
  }
}

/**
 * Pick the first `Error`-shaped value from a list of candidates,
 * or `undefined` if none qualify. Used when chaining a `cause` from
 * either the abort signal's `reason` or the underlying open-time
 * error — whichever is an actual Error.
 */
function pickError(...candidates: unknown[]): Error | undefined {
  for (const candidate of candidates) {
    if (candidate instanceof Error) {
      return candidate;
    }
  }
}

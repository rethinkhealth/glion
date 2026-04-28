/**
 * Deno runtime adapter for `@glion/mllp-client`.
 *
 * Re-exports the core `MllpClient` pre-wired with a `connect`
 * implementation that uses `Deno.connect` / `Deno.connectTls`.
 * Application code on Deno imports from this entry:
 *
 * ```ts
 * import { MllpClient } from "@glion/mllp-client/deno";
 *
 * const client = new MllpClient({ host: "127.0.0.1", port: 2575 });
 * const ack = await client.send(rawHl7Message);
 * ```
 *
 * The `Deno.connect*` family is only available inside the Deno
 * runtime. Importing this entry from a Node or Workers build will
 * fail at module-resolution time — that's the intended behaviour,
 * since each runtime should pick its own adapter.
 *
 * @module
 */

// `Deno` is a runtime-provided global — its shape is declared in
// `./deno-types.d.ts` so this file type-checks in any TypeScript
// environment without forcing a dependency on `@types/deno`.
import { MllpClient as CoreMllpClient } from "../core/client";
import type {
  BoundMllpClientOptions,
  MllpClientOptions,
  MllpClientTlsOptions,
} from "../core/client";
import type { MllpConnect, MllpDuplexStream } from "../core/connect";
import { MllpClientError, MllpClientErrorCode } from "../core/errors";

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * MLLP client pre-wired with the Deno connector. API-identical to
 * the core class — the only difference is that callers do not need
 * to supply `connect`.
 */
export class MllpClient extends CoreMllpClient {
  constructor(options: BoundMllpClientOptions) {
    super({ ...options, connect: denoConnect });
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
// Deno connector
// ---------------------------------------------------------------------------

/**
 * `MllpConnect` implementation backed by `Deno.connect` /
 * `Deno.connectTls`. Returns a {@link MllpDuplexStream} that mirrors
 * the Deno connection's already-Web-Streams shape.
 *
 * Deno's TLS API exposes `caCerts` (array of PEM strings) and a
 * client-cert/key pair. The `passphrase` option from
 * {@link MllpClientTlsOptions} is currently ignored because Deno's
 * `connectTls` does not surface it; encrypted private keys must be
 * decrypted before being passed to the client.
 *
 * `insecure: true` is rejected — Deno does not expose an option to
 * skip certificate verification on `connectTls`. For local-dev
 * scenarios that need a self-signed cert, run Deno with
 * `--unsafely-ignore-certificate-errors=<host>` instead.
 */
export const denoConnect: MllpConnect = async (params) => {
  rejectUnsupportedTls(params.tls);

  // Eagerly honour an already-aborted signal so we don't even start
  // the connect. `subscribeAbort` collapses the "aborted-vs-aborting"
  // branch but we want this short-circuit before allocating a conn.
  if (params.signal?.aborted) {
    throw toAbortError(params.signal.reason, params.host, params.port);
  }

  let conn: Deno.TcpConn;
  try {
    conn = await (params.tls
      ? Deno.connectTls({
          caCerts: toCaCerts(params.tls.ca),
          certChain: toPem(params.tls.cert),
          hostname: params.tls.servername ?? params.host,
          port: params.port,
          privateKey: toPem(params.tls.key),
        })
      : Deno.connect({
          hostname: params.host,
          port: params.port,
        }));
  } catch (error) {
    if (params.signal?.aborted) {
      throw toAbortError(params.signal.reason, params.host, params.port, error);
    }
    throw mapDenoConnectError(error, params.host, params.port);
  }

  // If the deadline fired while we were connecting, close the
  // freshly-opened conn and surface as TIMEOUT.
  if (params.signal?.aborted) {
    try {
      conn.close();
    } catch {
      /* already closed by Deno itself */
    }
    throw toAbortError(params.signal.reason, params.host, params.port);
  }

  const duplex: MllpDuplexStream = {
    close: () => {
      try {
        conn.close();
      } catch {
        /* close() must be idempotent; tolerate post-close calls */
      }
    },
    readable: conn.readable,
    writable: conn.writable,
  };
  return duplex;
};

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
  fallbackCause?: unknown
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
 * Reject TLS configuration the Deno runtime cannot honour. Surfacing
 * the mismatch as `INVALID_INPUT` is more honest than silently
 * dropping the material.
 *
 * `insecure: true` is rejected because `Deno.connectTls` has no
 * runtime opt-out; `passphrase` is rejected because Deno expects the
 * private key to be already decrypted.
 */
function rejectUnsupportedTls(tls: MllpClientTlsOptions | undefined): void {
  if (!tls) {
    return;
  }
  if (tls.insecure === true) {
    throw new MllpClientError(
      MllpClientErrorCode.INVALID_INPUT,
      "Deno does not expose a runtime flag to disable cert verification — pass --unsafely-ignore-certificate-errors=<host> to the Deno binary instead"
    );
  }
  if (tls.passphrase !== undefined) {
    throw new MllpClientError(
      MllpClientErrorCode.INVALID_INPUT,
      "Deno's connectTls does not accept a passphrase — decrypt the private key before passing it to the client"
    );
  }
}

/**
 * Translate a thrown value from `Deno.connect*` into a typed
 * {@link MllpClientError}, narrowing on Deno's error subclasses
 * where possible. Permission failures become `INVALID_INPUT` (the
 * caller forgot `--allow-net`); everything else routes to
 * `CONNECTION_REFUSED`.
 */
function mapDenoConnectError(
  error: unknown,
  host: string,
  port: number
): MllpClientError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  const target = `${host}:${port}`;

  // Deno surfaces permission failures as `Deno.errors.PermissionDenied`
  // which subclasses Error. We sniff the constructor name because
  // structured access varies across Deno versions.
  const name = error instanceof Error ? error.constructor.name : "";
  if (name === "PermissionDenied" || name === "NotCapable") {
    return new MllpClientError(
      MllpClientErrorCode.INVALID_INPUT,
      `Deno denied network access to ${target} — re-run with --allow-net=${host}:${port}: ${message}`,
      { cause }
    );
  }

  return new MllpClientError(
    MllpClientErrorCode.CONNECTION_REFUSED,
    `Could not connect to ${target}: ${message}`,
    { cause }
  );
}

/**
 * Coerce CA material from the cross-runtime `string | Uint8Array`
 * shape into Deno's `string[]` (array of PEM strings) form. Multiple
 * concatenated PEM blocks in a single string are passed through as
 * one entry — Deno parses concatenated blocks transparently.
 */
function toCaCerts(
  input: string | Uint8Array | undefined
): string[] | undefined {
  if (input === undefined) {
    return;
  }
  return [toPem(input)!];
}

/**
 * Coerce a `string | Uint8Array` into the PEM string form Deno
 * expects. Returns `undefined` when the input is undefined.
 */
function toPem(input: string | Uint8Array | undefined): string | undefined {
  if (input === undefined) {
    return;
  }
  return typeof input === "string" ? input : new TextDecoder().decode(input);
}

/**
 * Pick the first `Error`-shaped value from a list of candidates,
 * or `undefined` if none qualify. Used when chaining a `cause` from
 * either the abort signal's `reason` or the underlying connect-time
 * error — whichever is an actual Error.
 */
function pickError(...candidates: unknown[]): Error | undefined {
  for (const candidate of candidates) {
    if (candidate instanceof Error) {
      return candidate;
    }
  }
}

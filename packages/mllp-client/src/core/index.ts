/**
 * Runtime-free entry point of `@glion/mllp-client`.
 *
 * Use this when you need to run the client in a non-standard runtime
 * (for example, in a browser via a WebSocket-to-MLLP gateway, or
 * with an in-memory pipe for tests). Construction requires you to
 * supply your own {@link MllpConnect} function.
 *
 * For the common case (Node, Bun, Deno, Cloudflare Workers), prefer
 * the per-runtime adapters which ship a pre-wired connector:
 *
 * - `@glion/mllp-client` — Node and Bun (default entry)
 * - `@glion/mllp-client/deno` — Deno
 * - `@glion/mllp-client/workers` — Cloudflare Workers
 *
 * @module
 */

// biome-ignore-all lint/performance/noBarrelFile: package surface

export type { Acknowledgment } from "./acknowledgment";
export { MllpClient } from "./client";
export type {
  BoundMllpClientOptions,
  MllpClientOptions,
  MllpClientTlsOptions,
  SendOptions,
} from "./client";
export type {
  MllpConnect,
  MllpConnectParams,
  MllpDuplexStream,
} from "./connect";
export { MllpClientError, MllpClientErrorCode } from "./errors";

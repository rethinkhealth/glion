/**
 * Default entry point of `@glion/mllp-client`.
 *
 * `import { MllpClient } from "@glion/mllp-client"` resolves here on
 * Node and Bun. This module is a thin re-export of
 * `@glion/mllp-client/node` so the common case stays a single
 * import line.
 *
 * For other runtimes:
 *
 * - Deno: `@glion/mllp-client/deno`
 * - Cloudflare Workers: `@glion/mllp-client/workers`
 * - Custom transport / browser via a bridge: `@glion/mllp-client/core`
 *
 * Bundlers that honour the `workerd` and `deno` keys in this
 * package's `exports` map will automatically pick the right entry
 * for the target runtime — the per-runtime subpaths are also
 * available as explicit imports for clarity.
 *
 * @module
 */

// biome-ignore-all lint/performance/noBarrelFile: public package surface

export type { Acknowledgment } from "./core/acknowledgment";
export type {
  MllpConnect,
  MllpConnectParams,
  MllpDuplexStream,
} from "./core/connect";
export { MllpClientError, MllpClientErrorCode } from "./core/errors";
export { MllpClient, nodeConnect } from "./runtimes/node";
export type {
  BoundMllpClientOptions,
  MllpClientOptions,
  MllpClientTlsOptions,
  SendOptions,
} from "./runtimes/node";

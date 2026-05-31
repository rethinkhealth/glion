/**
 * Resolve the MLLP target for `glion send`.
 *
 * Without `--local`, the target is the explicit `--host`/`--port` pair. With
 * `--local`, host and port come from the project's `glion.config.ts` (the same
 * config `dev`/`start` load), so a message can be fired at the server this
 * project defines without retyping the address. Flags still override the
 * individual fields the config provides.
 *
 * The address-mapping logic ({@link deriveLocalTarget}) is pure and lives apart
 * from the config IO ({@link resolveTarget}) so it can be tested directly.
 */

import { loadConfig } from "../config/load.js";
import { ensureCacheDir } from "../prebuild.js";
import type { SendArgs } from "./send.js";

const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";

export type TargetResult =
  | { ok: true; host: string; port: number }
  | { ok: false; reason: string };

/** The fields {@link deriveLocalTarget} reads from a resolved server config. */
interface ConnectableConfig {
  hostname: string;
  port: number;
  tls?: unknown;
}

/**
 * Map a server *bind* address to the address a client dials. A server bound to
 * a wildcard (`0.0.0.0` / `::` / `""`) accepts connections on loopback, so that
 * is what we connect to — dialing the wildcard itself is not meaningful.
 */
function toConnectHost(hostname: string): string {
  if (hostname === "::") {
    return LOOPBACK_V6;
  }
  if (hostname === "0.0.0.0" || hostname === "") {
    return LOOPBACK_V4;
  }
  return hostname;
}

/**
 * Derive a connect target from a project's server config. Pure — the config IO
 * lives in {@link resolveTarget}. `--host`/`--port` override individual fields.
 */
export function deriveLocalTarget(
  config: ConnectableConfig,
  overrides: { host?: string; port?: number }
): TargetResult {
  if (config.tls) {
    return {
      ok: false,
      reason:
        "The server config enables TLS, but `glion send` has no TLS client yet. Send to a plaintext endpoint, or pass --host/--port without --local.",
    };
  }

  const port = overrides.port ?? config.port;
  if (port === 0) {
    return {
      ok: false,
      reason:
        "The server config uses port 0 (an OS-assigned ephemeral port), so a target can't be derived. Pass --port explicitly.",
    };
  }

  return {
    host: overrides.host ?? toConnectHost(config.hostname),
    ok: true,
    port,
  };
}

/**
 * Resolve the MLLP target. Without `--local`, `--host` and `--port` are both
 * required. With `--local`, the target comes from `glion.config.ts` (loaded the
 * same way `dev`/`start` do), with `--host`/`--port` overriding.
 */
export async function resolveTarget(
  args: SendArgs,
  cwd: string
): Promise<TargetResult> {
  if (!args.local) {
    if (args.host === undefined || args.port === undefined) {
      return {
        ok: false,
        reason:
          "Specify a target with --host and --port, or use --local to read it from glion.config.ts.",
      };
    }
    return { host: args.host, ok: true, port: args.port };
  }

  const cacheDir = await ensureCacheDir(cwd);
  const config = await loadConfig({
    cacheDir,
    cwd,
    explicitPath: args.configPath,
    mode: "dev",
  });
  return deriveLocalTarget(config, { host: args.host, port: args.port });
}

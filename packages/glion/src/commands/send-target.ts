/**
 * The project `glion send` runs in: its client settings, the MLLP target, and
 * the TLS to dial it with.
 *
 * The target is the `--host`/`--port` pair the invocation names. The config is
 * loaded for its `client` block — the timeouts, dial policy and TLS the send
 * uses — and is the defaults when the project has no config file.
 *
 * @module
 */

import type { NodeSocketOptions } from "@glion/mllp-client/node";

import { loadConfig } from "../config/load";
import { DEFAULT_PORT } from "../config/schema";
import type { ResolvedConfig } from "../config/schema";
import { GlionError } from "../errors";
import type { SendArgs } from "./send";
import type { SendTarget } from "./send-render";
import { loadTls } from "./send-tls";

export type TargetResult =
  | { ok: true; host: string; port: number }
  | { ok: false; reason: string };

/** The `client` settings other than `tls`: `MllpClientOptions` as given. */
export type ClientSettings = Omit<NonNullable<ResolvedConfig["client"]>, "tls">;

/** The project resolved for one `glion send`, or why it could not be. */
export type ProjectResult =
  | {
      ok: true;
      client: ClientSettings;
      target: SendTarget;
      tls: NodeSocketOptions["tls"];
    }
  | { ok: false; reason: string; target?: SendTarget };

/**
 * Resolve the MLLP target. `--host` names the receiver; `--port` defaults to
 * {@link DEFAULT_PORT}, the port MLLP standardizes on. The port is a protocol
 * constant, while the host is the identity of the system that receives the
 * message and is never assumed.
 */
export function resolveTarget(args: SendArgs): TargetResult {
  if (args.host === undefined) {
    return {
      ok: false,
      reason:
        "No target host is defined. Pass `--host` with the system to send to.",
    };
  }
  return { host: args.host, ok: true, port: args.port ?? DEFAULT_PORT };
}

/**
 * Resolves the target from `args`, then loads the project's config and reads
 * the TLS files `client.tls` names. A target that cannot be resolved, a config
 * that fails to load, and a TLS file that cannot be read are `reason`s;
 * anything else propagates.
 */
export async function resolveProject(
  args: SendArgs,
  cwd: string
): Promise<ProjectResult> {
  const resolved = resolveTarget(args);
  if (!resolved.ok) {
    return resolved;
  }
  const target = { host: resolved.host, port: resolved.port };
  try {
    const config = await loadConfig({ cwd, explicitPath: args.configPath });
    const { tls: configured, ...client } = config.client ?? {};
    const tls = await loadTls(configured);
    return { client, ok: true, target, tls };
  } catch (error) {
    if (error instanceof GlionError) {
      // The target was resolved before the config was read, so a TLS file
      // that cannot be read still reports the endpoint it was aimed at.
      return { ok: false, reason: error.message, target };
    }
    throw error;
  }
}

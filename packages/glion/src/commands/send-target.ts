/**
 * The project `glion send` runs in: its config, and the MLLP target.
 *
 * The target is the `--host`/`--port` pair the invocation names. The config is
 * loaded for its `client` block — the timeouts and dial policy the send uses —
 * and is the defaults when the project has no config file.
 *
 * @module
 */

import { loadConfig } from "../config/load";
import { DEFAULT_PORT } from "../config/schema";
import type { ResolvedConfig } from "../config/schema";
import { GlionError } from "../errors";
import type { SendArgs } from "./send";
import type { SendTarget } from "./send-render";

export type TargetResult =
  | { ok: true; host: string; port: number }
  | { ok: false; reason: string };

/** The project resolved for one `glion send`, or why it could not be. */
export type ProjectResult =
  | { ok: true; config: ResolvedConfig; target: SendTarget }
  | { ok: false; reason: string };

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
 * Loads the project's config and resolves the target from `args`. A config
 * that fails to load and a target that cannot be resolved are `reason`s;
 * anything else propagates.
 */
export async function resolveProject(
  args: SendArgs,
  cwd: string
): Promise<ProjectResult> {
  const target = resolveTarget(args);
  if (!target.ok) {
    return target;
  }
  try {
    const config = await loadConfig({ cwd, explicitPath: args.configPath });
    return {
      config,
      ok: true,
      target: { host: target.host, port: target.port },
    };
  } catch (error) {
    if (error instanceof GlionError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

/**
 * Resolve the MLLP target for `glion send`.
 *
 * The target is the `--host`/`--port` pair the invocation names. The command
 * is a client: it sends to the system the operator points it at, and takes no
 * part in what address a server of this project binds.
 */

import type { SendArgs } from "./send";

export type TargetResult =
  | { ok: true; host: string; port: number }
  | { ok: false; reason: string };

/** Resolve the MLLP target. `--host` and `--port` are both required. */
export function resolveTarget(args: SendArgs): TargetResult {
  if (args.host === undefined || args.port === undefined) {
    return {
      ok: false,
      reason: "Specify a target with --host and --port.",
    };
  }
  return { host: args.host, ok: true, port: args.port };
}

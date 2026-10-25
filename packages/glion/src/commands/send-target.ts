/**
 * Resolve where a `glion send` is aimed: the `--host`/`--port` pair the
 * invocation names, and the TLS it dials with.
 *
 * The command is a client: it sends to the system the operator points it at,
 * and takes no part in what address a server of this project binds.
 *
 * @module
 */

import { connect as connectTcp, isIP } from "node:net";
import type { Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import { DEFAULT_PORT } from "../constants";
import { causeMessage, GlionError } from "../errors";
import type { SendArgs } from "./send";
import type { SendTarget } from "./send-render";
import { loadTls } from "./send-tls";

export type TargetResult =
  | { ok: true; host: string; port: number }
  | { ok: false; reason: string; hint?: string };

/**
 * Resolve the MLLP target. `--host` names the receiver; `--port` defaults to
 * {@link DEFAULT_PORT}, the port MLLP standardizes on. The port is a protocol
 * constant, while the host is the identity of the system that receives the
 * message and is never assumed.
 */
export function resolveTarget(args: SendArgs): TargetResult {
  if (args.host === undefined) {
    return {
      hint: "Pass `--host` with the system to send to.",
      ok: false,
      reason: "No target host is defined.",
    };
  }
  return { host: args.host, ok: true, port: args.port ?? DEFAULT_PORT };
}

/** Where a `glion send` is aimed, and how the connection is secured. */
export type DestinationResult =
  | { ok: true; target: SendTarget; tls: ConnectionOptions | undefined }
  | {
      ok: false;
      reason: string;
      hint?: string;
      cause?: string;
      target?: SendTarget;
    };

/**
 * Resolves where the message goes and how the connection is secured: the
 * target {@link resolveTarget} reads from `args`, and the certificate files
 * the invocation names read into memory. A host that is not defined and a
 * file that cannot be read are `reason`s, each with the failure's own hint
 * and cause; anything else propagates.
 */
export async function resolveDestination(
  args: SendArgs
): Promise<DestinationResult> {
  const resolved = resolveTarget(args);
  if (!resolved.ok) {
    return resolved;
  }
  const target = { host: resolved.host, port: resolved.port };
  try {
    return { ok: true, target, tls: await loadTls(args.tls) };
  } catch (error) {
    if (error instanceof GlionError) {
      // The target was resolved first, so a certificate file that cannot be
      // read still reports the endpoint the send was aimed at.
      return {
        cause: causeMessage(error.cause),
        hint: error.hint,
        ok: false,
        reason: error.message,
        target,
      };
    }
    throw error;
  }
}

/**
 * Opens a connection to `target`, with Nagle's algorithm off: over TLS with
 * `tls`, sending the host as the server name (SNI) unless it is an IP address
 * or `tls` names one, and over plain TCP without it.
 */
export function dialTarget(
  target: SendTarget,
  tls?: ConnectionOptions
): Socket {
  const { host, port } = target;
  if (tls === undefined) {
    return connectTcp({ host, port }).setNoDelay(true);
  }
  // `tls.connect()` sends SNI only when `servername` is set. An IP address is
  // never a server name (RFC 6066 §3).
  const servername = isIP(host) ? undefined : host;
  return connectTls({ servername, ...tls, host, port }).setNoDelay(true);
}

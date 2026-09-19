/**
 * The TLS `glion send` dials with: settings from the project's config, and
 * the certificate files they name read into memory.
 *
 * @module
 */

import type {
  NodeSocketOptions,
  NodeTlsOptions,
} from "@glion/mllp-client/node";

import { readTlsFile } from "../child/tls";
import type { ResolvedConfig } from "../config/schema";

/** `client.tls` as the config holds it: file paths, not contents. */
export type ClientTlsConfig = NonNullable<
  NonNullable<ResolvedConfig["client"]>["tls"]
>;

/**
 * `settings` with each file it names read into memory, as `nodeSocket` takes
 * them.
 *
 * @throws {GlionError} A file could not be read (`tls-read-failed`).
 */
export async function loadTls(
  settings?: ClientTlsConfig
): Promise<NodeSocketOptions["tls"]> {
  if (settings === undefined || typeof settings === "boolean") {
    return settings;
  }
  const { ca, cert, key, pfx, ...rest } = settings;
  const read = (path: string | undefined, name: string) =>
    path === undefined ? undefined : readTlsFile(path, `the TLS ${name} file`);
  const [caBytes, certBytes, keyBytes, pfxBytes] = await Promise.all([
    read(ca, "ca"),
    read(cert, "cert"),
    read(key, "key"),
    read(pfx, "pfx"),
  ]);
  const options: NodeTlsOptions = { ...rest };
  if (caBytes !== undefined) {
    options.ca = caBytes;
  }
  if (certBytes !== undefined) {
    options.cert = certBytes;
  }
  if (keyBytes !== undefined) {
    options.key = keyBytes;
  }
  if (pfxBytes !== undefined) {
    options.pfx = pfxBytes;
  }
  return options;
}

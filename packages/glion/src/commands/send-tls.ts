/**
 * The TLS `glion send` dials with: the certificate files the invocation names,
 * read into memory.
 *
 * @module
 */

import type { ConnectionOptions } from "node:tls";

import { readTlsFile } from "../tls";
import type { SendTlsArgs } from "./send";

/**
 * The TLS `tls` asks for, with each file it names read into memory, as
 * `tls.connect()` takes them. `undefined` dials in plaintext.
 *
 * @throws {GlionError} A file could not be read (`tls-read-failed`).
 */
export async function loadTls(
  tls?: SendTlsArgs
): Promise<ConnectionOptions | undefined> {
  if (tls === undefined) {
    return undefined;
  }
  const read = (path: string | undefined, flag: string) =>
    path === undefined ? undefined : readTlsFile(path, flag);
  const [ca, cert, key] = await Promise.all([
    read(tls.ca, "--ca"),
    read(tls.cert, "--cert"),
    read(tls.key, "--key"),
  ]);
  const options: ConnectionOptions = {};
  if (tls.insecure) {
    options.rejectUnauthorized = false;
  }
  if (ca !== undefined) {
    options.ca = ca;
  }
  if (cert !== undefined) {
    options.cert = cert;
  }
  if (key !== undefined) {
    options.key = key;
  }
  return options;
}

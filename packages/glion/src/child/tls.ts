import { readFile } from "node:fs/promises";

import { GlionError } from "../errors";

/**
 * Reads one of the TLS files a config names, or throws. `field` is the config
 * field that named it, written as the user wrote it — `tls.ca`,
 * `client.tls.cert` — so the hint points at the line to change and a server's
 * failure reads differently from a client's.
 *
 * The fs error is preserved as `cause`, so the OS-level code (ENOENT, EACCES,
 * …) stays available to whoever wants it without being spliced into the
 * sentence.
 */
export async function readTlsFile(
  path: string,
  field: string
): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new GlionError(
      "tls-read-failed",
      `The TLS file \`${path}\` could not be read.`,
      { field, path },
      `Check that \`${field}\` names a file this process can read (chmod 600 for key files).`,
      error
    );
  }
}

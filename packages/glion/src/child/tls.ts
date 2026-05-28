import { readFile } from "node:fs/promises";

import { GlionError } from "../errors.js";

/**
 * Reads a TLS certificate / key / ca file or throws a descriptive
 * GlionError. Used by runner.ts for each of `tls.cert`, `tls.key`, and
 * `tls.ca` — the `field` argument identifies which one is being loaded
 * so the error message can point at the exact config field that
 * failed.
 *
 * The original fs error is preserved as the GlionError's `cause` so
 * callers can still inspect the OS-level code (ENOENT, EACCES, …) for
 * automated handling, while the human-facing message is descriptive
 * enough to act on without the OS error code.
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
      `Failed to read ${field} at ${path}`,
      { field, path },
      "Check that the file exists and is readable (chmod 600 for key files).",
      error
    );
  }
}

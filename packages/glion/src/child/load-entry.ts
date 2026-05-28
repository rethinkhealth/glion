import { pathToFileURL } from "node:url";

import { Mllp } from "@glion/mllp";

import { GlionError } from "../errors.js";

/**
 * Imports the pre-built entry module and validates it exports an
 * Mllp instance.
 *
 * The import uses `pathToFileURL` because Node's `import()` on
 * Windows requires `file://` URLs — bare absolute paths fail.
 *
 * The `instanceof Mllp` check ensures the user's entry file actually
 * exports a configured MLLP app, not an arbitrary object. This catches
 * the common mistake of forgetting `export default`, of exporting a
 * named binding that the parent's prebuild discarded, or of returning
 * a configuration object instead of an Mllp instance.
 *
 * Two distinct GlionError kinds are produced so the parent supervisor
 * (and the user) can tell *what* went wrong:
 *
 * - `entry-load-failed` — the file couldn't be imported at all (missing, syntax
 *   error, transitive import threw, …).
 * - `entry-not-mllp-instance` — the import succeeded but the default export
 *   wasn't an Mllp.
 */
export async function loadEntry(compiledEntryPath: string): Promise<Mllp> {
  let value: unknown;
  try {
    const mod = (await import(pathToFileURL(compiledEntryPath).href)) as {
      default?: unknown;
    };
    value = mod.default ?? mod;
  } catch (error) {
    throw new GlionError(
      "entry-load-failed",
      `Failed to load compiled entry ${compiledEntryPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { entry: compiledEntryPath },
      "Check the entry file path and that it compiles without errors.",
      error
    );
  }
  if (!(value instanceof Mllp)) {
    throw new GlionError(
      "entry-not-mllp-instance",
      "The default export of the entry file must be an Mllp instance.",
      { actualType: typeof value, entry: compiledEntryPath },
      `Change your entry file to:
  import { Mllp } from "@glion/mllp";
  export default new Mllp().parser(...).on("ADT^A01", ...);`
    );
  }
  return value;
}

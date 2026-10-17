import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Config filenames searched in cwd, in priority order.
 *
 * Security: only cwd is searched — never ancestor directories — so a
 * config file in a parent directory (e.g. `$HOME/glion.config.ts`)
 * cannot be silently discovered and executed.
 */
export const CONFIG_FILENAMES = [
  "glion.config.ts",
  "glion.config.mts",
  "glion.config.mjs",
  "glion.config.js",
] as const;

/**
 * Searches `cwd` for a glion config file and returns its absolute
 * path, or `null` if none of the recognised names exist.
 *
 * The search is flat: only `cwd` is inspected, not its ancestors.
 * That's deliberate — walking up would let a shared parent directory
 * (e.g. `$HOME`) inject a config into an unrelated project, turning
 * `glion dev` in any subdirectory into arbitrary code execution.
 *
 * Priority matches the order of `CONFIG_FILENAMES`: TypeScript wins
 * over other extensions. That keeps the ergonomic choice (`.ts`)
 * stable while still allowing projects without a TS toolchain to
 * use `.mjs` or `.js`.
 */
export function discoverConfig(cwd: string): Promise<string | null> {
  return firstReadable(cwd, CONFIG_FILENAMES);
}

/**
 * App entry filenames searched in `cwd` when the project has no config file,
 * in priority order. A project that follows one of these conventions needs no
 * `glion.config.ts` to run.
 */
export const ENTRY_FILENAMES = ["glion.app.ts", "src/glion.app.ts"] as const;

/**
 * Searches `cwd` for a conventional app entry and returns its absolute path,
 * or `null` when neither name exists. Flat like {@link discoverConfig}: only
 * `cwd` is inspected, never an ancestor.
 */
export function discoverEntry(cwd: string): Promise<string | null> {
  return firstReadable(cwd, ENTRY_FILENAMES);
}

/** Whether `path` exists and this process may read it. */
export async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    // Not readable or not present — the only two outcomes callers act on.
    return false;
  }
}

/** The first of `names` under `cwd` that is readable, as an absolute path. */
async function firstReadable(
  cwd: string,
  names: readonly string[]
): Promise<string | null> {
  for (const name of names) {
    const abs = resolve(cwd, name);
    if (await isReadable(abs)) {
      return abs;
    }
  }
  return null;
}

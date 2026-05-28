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
export async function discoverConfig(cwd: string): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    const abs = resolve(cwd, name);
    try {
      await access(abs, constants.R_OK);
      return abs;
    } catch {
      // Not readable or not present; try the next filename.
    }
  }
  return null;
}

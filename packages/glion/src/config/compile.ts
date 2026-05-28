import { chmod, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { transform } from "rolldown/utils";

/**
 * Type-strips a config file and writes the result to the cache dir.
 *
 * Glion config files are simple single-file modules — they import
 * `defineConfig` from `glion/config`, optionally pull in a type or
 * two, and export a default object. They don't need bundling; they
 * need their TypeScript types stripped so Node's native `import()`
 * can load them.
 *
 * That's what this function does: invoke rolldown's `transform()`
 * (which is a type-strip, NOT a bundle) and write the resulting .mjs
 * alongside the manifest in `.glion/`. Import statements pass through
 * verbatim so `import { defineConfig } from "@glion/cli/config"` still
 * works at runtime.
 *
 * This is deliberately separate from `src/prebuild.ts`'s `buildFile`:
 * entry files may import local helpers and therefore need bundling;
 * config files must not import local code (it would have to be
 * compiled separately, which we don't do), so a strip is both
 * sufficient and faster.
 *
 * @returns Absolute path of the compiled `.mjs` inside `cacheDir`
 */
export async function compileConfig(
  configPath: string,
  cacheDir: string
): Promise<string> {
  const source = await readFile(configPath, "utf8");
  const result = await transform(configPath, source, {
    lang: langFromPath(configPath),
    sourceType: "module",
  });
  if (result.errors.length > 0) {
    // Aggregate every error rather than throwing only the first.
    // rolldown typically halts at the first parse failure, but the
    // return type allows multiple and we shouldn't silently discard
    // them — the user should see everything wrong in one pass.
    //
    // Single-error path: pass through the original value so its
    //   structure (loc, source, etc.) survives unchanged.
    // Multi-error path: wrap in AggregateError whose message is a
    //   formatted summary and whose `.errors` array preserves each
    //   individual error for programmatic inspection.
    const errs = result.errors.map(toError);
    if (errs.length === 1) {
      throw errs[0];
    }
    const summary = errs.map((e) => `  - ${e.message}`).join("\n");
    throw new AggregateError(errs, `${errs.length} errors:\n${summary}`);
  }
  const outPath = resolve(cacheDir, `${stem(configPath)}.mjs`);
  // Mode 0600: the compiled config is the user's `glion.config.ts`
  // with TS types stripped. If the user hard-coded a TLS passphrase
  // (or any secret) into the config, it survives the transform and
  // ends up on disk. Match the 0600 posture the manifest uses — the
  // cache dir's 0700 mode protects traversal, but defense in depth
  // means each file controls its own readability.
  //
  // Explicit chmod AFTER writeFile because `{ mode }` only applies
  // when the file is created; a previous run's permissive file gets
  // truncated with its old mode preserved. chmod closes the upgrade
  // path for existing installs.
  await writeFile(outPath, result.code, { mode: 0o600 });
  await chmod(outPath, 0o600);
  return outPath;
}

/**
 * Coerces whatever rolldown throws into a proper `Error`. rolldown's
 * error values are either Error instances or plain objects with a
 * `message` field; fall back to a JSON stringification for anything
 * else so we never lose diagnostic content.
 */
function toError(v: unknown): Error {
  if (v instanceof Error) {
    return v;
  }
  if (typeof v === "string") {
    return new Error(v);
  }
  if (v && typeof v === "object" && "message" in v) {
    return new Error(String((v as { message: unknown }).message));
  }
  return new Error(JSON.stringify(v));
}

/** `.glion/<stem>.mjs` — drop the extension, keep everything else. */
function stem(filePath: string): string {
  const name = basename(filePath);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Map a filename extension to the language hint rolldown expects. */
function langFromPath(filePath: string): "ts" | "tsx" | "js" | "jsx" {
  if (filePath.endsWith(".tsx")) {
    return "tsx";
  }
  if (filePath.endsWith(".jsx")) {
    return "jsx";
  }
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return "js";
  }
  return "ts";
}

import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GlionError } from "../errors.js";
import { compileConfig } from "./compile.js";
import { CONFIG_FILENAMES, discoverConfig } from "./discover.js";
import type { ResolvedConfig } from "./schema.js";
import { makeGlionConfigSchema } from "./schema.js";

export interface LoadConfigOptions {
  /** Project root — config files are searched here. */
  cwd: string;
  /** Absolute path to the .glion/ cache directory (created by the caller). */
  cacheDir: string;
  /** Skip discovery and load this specific file. */
  explicitPath?: string;
  /**
   * Drives the default hostname:
   * dev   → 127.0.0.1 (localhost only, safe for development)
   * start → 0.0.0.0   (all interfaces, for production behind a firewall)
   */
  mode?: "dev" | "start";
}

/**
 * Discovers and loads a glion config file.
 *
 * The pipeline:
 *
 * 1. **Discover** — find `glion.config.{ts,mts,mjs,js}` in cwd (or use the
 *    explicit path if provided)
 * 2. **Compile** — strip TS types via rolldown `transform()` and write the JS to
 *    `.glion/<name>.mjs`
 * 3. **Import** — native `import()` on the compiled JS
 * 4. **Validate + transform** — schema factory parses the value AND applies all
 *    normalizations (path resolution, mode-dependent hostname, watch default)
 *    via Zod transforms in a single pass.
 *
 * Throws `config-not-found` if no config file exists.
 * Throws `config-invalid` if the config fails schema validation.
 */
export async function loadConfig(
  opts: LoadConfigOptions
): Promise<ResolvedConfig> {
  const mode = opts.mode ?? "start";

  // Discovery: check each known filename in cwd, or use the explicit path.
  const configPath = opts.explicitPath ?? (await discoverConfig(opts.cwd));

  if (!configPath) {
    throw new GlionError(
      "config-not-found",
      "No glion config file found.",
      { cwd: opts.cwd, searched: CONFIG_FILENAMES },
      `Create a config file:\n\n  import { defineConfig } from "@glion/cli/config";\n  export default defineConfig({ entry: "./src/app.ts" });`
    );
  }

  // Normalize: explicit paths may be relative — resolve against cwd
  // to get a stable absolute path for downstream callers (cache keys,
  // error messages, path.resolve for tls/entry fields).
  //
  // NOTE: this does NOT restrict where the config can live.
  // `--config ../../etc/passwd` resolves to /etc/passwd and would be
  // compiled + imported (→ arbitrary code execution). That's by
  // design — `--config` is an operator-level flag and the operator is
  // trusted. Do not forward `--config` from untrusted input.
  const absConfigPath = isAbsolute(configPath)
    ? configPath
    : resolve(opts.cwd, configPath);

  // Compile: rolldown transform() strips TS types and writes .mjs to
  // the cache dir. Any failure here (syntax error in the user's TS,
  // fs error writing to cacheDir, rolldown parse diagnostic) must
  // become a `config-invalid` with the original error as `cause`;
  // otherwise it bubbles up as a raw error and the supervisor
  // classifies it as a generic child crash — misleading because the
  // failure is in the user's config file, not the child process.
  let compiled: string;
  try {
    compiled = await compileConfig(absConfigPath, opts.cacheDir);
  } catch (error) {
    throw new GlionError(
      "config-invalid",
      `Failed to compile glion config at ${absConfigPath}: ${errorMessage(error)}`,
      { configPath: absConfigPath, phase: "compile" },
      "Check the config file for syntax errors.",
      error
    );
  }

  // Import: native import() on the compiled JS. pathToFileURL is
  // required because import() on Windows needs file:// URLs. Wrapped
  // in its own try/catch so we can distinguish "compile failed" from
  // "the module loaded but threw at the top level" — the user needs
  // to know WHICH stage failed, because the fix is different.
  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(compiled).href)) as {
      default?: unknown;
    };
  } catch (error) {
    throw new GlionError(
      "config-invalid",
      `Failed to import glion config at ${absConfigPath}: ${errorMessage(error)}`,
      { configPath: absConfigPath, phase: "import" },
      "Check that the config module loads without throwing at import time (missing dependency? top-level throw?).",
      error
    );
  }

  // Validate + transform in one pass. The schema factory closes over
  // the runtime context (configPath, cwd, mode) so its `.transform()`
  // calls produce the fully-normalized ResolvedConfig directly — the
  // loader contributes zero fields to the output.
  const schema = makeGlionConfigSchema({
    configPath: absConfigPath,
    cwd: opts.cwd,
    mode,
  });
  const parsed = schema.safeParse(mod.default ?? mod);
  if (!parsed.success) {
    // Zod runs the whole schema and returns every issue in one pass.
    // Surface all of them — users shouldn't have to hit the parser
    // once per bad field. `input` is deliberately dropped from each
    // issue because it can contain raw user values (TLS passphrase,
    // cert contents); the remaining `path` / `code` / `message`
    // fields are generated by Zod itself and safe for structured
    // logging.
    const issues = parsed.error.issues.map(({ path, code, message }) => ({
      code,
      message,
      path: path.map(String),
    }));
    const body = issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const hint =
      issues.length === 1
        ? `Check field: ${issues[0]?.path.join(".") || "(root)"}`
        : `Fix the ${issues.length} fields listed above`;

    throw new GlionError(
      "config-invalid",
      `Invalid glion config at ${absConfigPath}:\n${body}`,
      { configPath: absConfigPath, issues },
      hint
      // No `cause`. The raw ZodError carries `issue.input` (in v4) and
      // enum-mismatch messages that quote received values — both leak
      // user data if a consumer walks `err.cause`. The sanitized
      // `issues` array in `context` is the authoritative diagnostic
      // surface and is safe for structured logs / fatal events.
    );
  }

  return parsed.data;
}

/** Safely stringifies anything thrown for inclusion in a GlionError message. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

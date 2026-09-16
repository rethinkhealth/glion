import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GlionError } from "../errors";
import { ensureCacheDir } from "../prebuild";
import { compileConfig } from "./compile";
import {
  CONFIG_FILENAMES,
  discoverConfig,
  discoverEntry,
  ENTRY_FILENAMES,
  isReadable,
} from "./discover";
import type { ResolvedConfig } from "./schema";
import { makeGlionConfigSchema } from "./schema";

export interface LoadConfigOptions {
  /** Project root — config files are searched here. */
  cwd: string;
  /** Skip discovery and load this specific file. */
  explicitPath?: string;
}

/**
 * The config a project without a config file runs on: the conventional app
 * entry when the project has one, and the schema's default for every other
 * field — port 2575, and no bind address, which each command resolves for
 * itself.
 *
 * `configPath` is the config file the project would have had. Paths resolve
 * against its directory, which is `cwd`; nothing is read from or written to
 * it, and no cache directory is needed because there is nothing to compile.
 */
export async function defaultConfig(cwd: string): Promise<ResolvedConfig> {
  const entry = (await discoverEntry(cwd)) ?? resolve(cwd, ENTRY_FILENAMES[0]);
  return makeGlionConfigSchema({
    configPath: resolve(cwd, CONFIG_FILENAMES[0]),
    cwd,
  }).parse({ entry });
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
 *    normalizations (path resolution, the watch default) via Zod transforms in
 *    a single pass.
 *
 * A project with no config file runs on {@link defaultConfig} — the
 * conventional entry and the schema's defaults — so a config file is a way to
 * change the defaults, not a requirement.
 *
 * Throws `config-not-found` if `explicitPath` names a file that is not there.
 * Throws `config-invalid` if the config fails to compile, import, or validate.
 */
export async function loadConfig(
  opts: LoadConfigOptions
): Promise<ResolvedConfig> {
  // Discovery: check each known filename in cwd, or use the explicit path.
  const configPath = opts.explicitPath ?? (await discoverConfig(opts.cwd));

  if (!configPath) {
    return defaultConfig(opts.cwd);
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

  // A discovered path was proven readable by the discovery; a path the
  // operator named may simply not be there, and saying so beats a compile
  // error about a file that does not exist.
  if (opts.explicitPath !== undefined && !(await isReadable(absConfigPath))) {
    throw new GlionError(
      "config-not-found",
      `No glion config file at \`${absConfigPath}\`.`,
      { configPath: absConfigPath },
      "Check the path passed to --config."
    );
  }

  // Compile: rolldown transform() strips TS types and writes .mjs to
  // the cache dir. Any failure here (syntax error in the user's TS,
  // fs error writing to cacheDir, rolldown parse diagnostic) must
  // become a `config-invalid` with the original error as `cause`;
  // otherwise it bubbles up as a raw error and the supervisor
  // classifies it as a generic child crash — misleading because the
  // failure is in the user's config file, not the child process.
  // The cache directory is created here, where there is something to put in
  // it: a project with no config file compiles nothing and keeps a clean
  // directory. It is created outside the try below so that a directory which
  // cannot be created is reported as itself, not as a compile failure.
  const cacheDir = await ensureCacheDir(opts.cwd);

  let compiled: string;
  try {
    compiled = await compileConfig(absConfigPath, cacheDir);
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
  // the runtime context (configPath, cwd) so its `.transform()`
  // calls produce the fully-normalized ResolvedConfig directly — the
  // loader contributes zero fields to the output.
  const schema = makeGlionConfigSchema({
    configPath: absConfigPath,
    cwd: opts.cwd,
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

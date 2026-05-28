import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "rolldown";

import type { ResolvedConfig } from "./config/schema.js";
import { GlionError } from "./errors.js";
import type { ChildManifest } from "./types.js";

/**
 * Ensures the `.glion/` cache directory exists and returns its path.
 *
 * Mode 0700: the cache dir holds the compiled config, compiled entry
 * file, and `manifest.json`. The manifest currently includes any TLS
 * passphrase from the user config, so the directory must not be
 * world-readable on shared hosts.
 */
export async function ensureCacheDir(cwd: string): Promise<string> {
  const dir = resolve(cwd, ".glion");
  await mkdir(dir, { mode: 0o700, recursive: true });
  return dir;
}

/**
 * Bundles a TS entry file and all its local imports into a single .mjs.
 * Package imports (node_modules) are left external for Node to resolve
 * at runtime. Best for entry files that may import from local TS modules.
 */
export async function buildFile(
  sourcePath: string,
  cacheDir: string
): Promise<string> {
  const output = await build({
    // Keep relative imports (local TS files) bundled. Mark everything
    // else (bare package specifiers, node: builtins) as external.
    external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    input: sourcePath,
    output: {
      dir: cacheDir,
      format: "esm",
    },
    resolve: {
      extensions: [".ts", ".mts", ".mjs", ".js", ".json"],
    },
  });

  // rolldown build() returns the output — find the entry chunk filename
  const chunk = output.output.find((o) => o.type === "chunk" && o.isEntry);
  if (!chunk) {
    throw new Error(`rolldown build produced no entry chunk for ${sourcePath}`);
  }
  return resolve(cacheDir, chunk.fileName);
}

/**
 * Builds the entry file, writes a manifest JSON with everything the
 * child process needs, and returns the manifest path.
 */
export async function prepareChild(
  config: ResolvedConfig,
  cacheDir: string
): Promise<string> {
  let compiledEntry: string;
  try {
    compiledEntry = await buildFile(config.entry, cacheDir);
  } catch (error) {
    throw new GlionError(
      "entry-load-failed",
      `Failed to build entry file ${config.entry}: ${error instanceof Error ? error.message : String(error)}`,
      { entry: config.entry },
      "Check the entry file path and that it compiles without errors.",
      error
    );
  }
  const manifest: ChildManifest = {
    compiledEntry,
    hostname: config.hostname,
    keepAlive: config.keepAlive,
    keepAliveInitialDelay: config.keepAliveInitialDelay,
    port: config.port,
    socketTimeout: config.socketTimeout,
    tls: config.tls,
  };
  const manifestPath = resolve(cacheDir, "manifest.json");
  // Mode 0600: manifest carries the TLS passphrase (when TLS is
  // configured) and the full compiled-entry path. Default umask
  // produces 0644 — world-readable. Limit to owner rw.
  //
  // `writeFile(..., { mode })` only applies on CREATE. If a previous
  // run left a world-readable manifest on disk, writeFile truncates
  // it and keeps the old perms. Explicit chmod after the write
  // closes the upgrade path — existing installs with permissive
  // manifests get tightened the next time glion runs.
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  await chmod(manifestPath, 0o600);
  return manifestPath;
}

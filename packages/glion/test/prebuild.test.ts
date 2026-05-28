import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolvedConfig } from "../src/config/schema.js";
import { buildFile, ensureCacheDir, prepareChild } from "../src/prebuild.js";

let dir: string;
let cacheDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-prebuild-"));
  cacheDir = await ensureCacheDir(dir);
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("buildFile", () => {
  it("bundles local TS imports into a single output", async () => {
    await mkdir(join(dir, "src"));
    await writeFile(
      join(dir, "src", "helper.ts"),
      `export const PORT: number = 3000;`
    );
    await writeFile(
      join(dir, "src", "app.ts"),
      `import { PORT } from "./helper.js";\nexport default { port: PORT };`
    );

    const outPath = await buildFile(join(dir, "src", "app.ts"), cacheDir);
    const mod = (await import(pathToFileURL(outPath).href)) as {
      default: unknown;
    };
    expect(mod.default).toEqual({ port: 3000 });
  });

  it("leaves node_modules imports external", async () => {
    const src = join(dir, "app.ts");
    await writeFile(
      src,
      `import { z } from "zod";\nexport default z.string();`
    );

    const outPath = await buildFile(src, cacheDir);
    const { readFile: rf } = await import("node:fs/promises");
    const code = await rf(outPath, "utf8");
    expect(code).toContain(`from "zod"`);
  });
});

describe("ensureCacheDir", () => {
  it("creates .glion/ directory and returns its path", async () => {
    const newDir = await mkdtemp(join(tmpdir(), "glion-cache-"));
    const result = await ensureCacheDir(newDir);
    expect(result).toBe(join(newDir, ".glion"));

    const info = await stat(result);
    expect(info.isDirectory()).toBe(true);
    await rm(newDir, { force: true, recursive: true });
  });

  it("creates .glion/ with mode 0700 (owner-only access)", async () => {
    // The cache dir contains the compiled config, compiled entry, and
    // the manifest (which may carry the TLS passphrase until #44/#57
    // are fully resolved). Default umask produces 0755 — world-readable.
    // Explicit 0700 means only the owning user can list or traverse it.
    const newDir = await mkdtemp(join(tmpdir(), "glion-cache-perms-"));
    try {
      const result = await ensureCacheDir(newDir);
      const info = await stat(result);
      // oxlint-disable-next-line no-bitwise
      expect(info.mode & 0o777).toBe(0o700);
    } finally {
      await rm(newDir, { force: true, recursive: true });
    }
  });
});

describe("prepareChild", () => {
  function makeConfig(entry: string): ResolvedConfig {
    return {
      configPath: join(dir, "glion.config.ts"),
      entry,
      gracefulCloseMs: 5000,
      hostname: "127.0.0.1",
      logging: {
        dir: join(dir, ".glion", "logs"),
        enabled: false,
        level: "info",
        maxFiles: 10,
      },
      port: 2575,
      watch: [dir],
    };
  }

  it("writes manifest.json with mode 0600 (owner rw, nothing for group/other)", async () => {
    // The manifest carries the TLS passphrase (when TLS is configured)
    // and the full compiled-entry path. Default umask produces 0644 —
    // world-readable. 0600 limits the blast radius on shared hosts and
    // in leaked artifacts (e.g., uploaded CI caches).
    await mkdir(join(dir, "src"));
    const entryPath = join(dir, "src", "app.ts");
    await writeFile(entryPath, "export default {};");

    const manifestPath = await prepareChild(makeConfig(entryPath), cacheDir);
    const info = await stat(manifestPath);
    // oxlint-disable-next-line no-bitwise
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("tightens perms on an existing permissive manifest.json (upgrade path)", async () => {
    // `writeFile(..., { mode })` only applies on CREATE. A pre-
    // existing manifest from before this hardening would keep its
    // permissive mode when re-written. The explicit chmod after the
    // write closes the upgrade path.
    await mkdir(join(dir, "src"));
    const entryPath = join(dir, "src", "app.ts");
    await writeFile(entryPath, "export default {};");

    // First prepareChild creates the manifest, then deliberately
    // loosen its perms to simulate a pre-upgrade install.
    const manifestPath = await prepareChild(makeConfig(entryPath), cacheDir);
    await chmod(manifestPath, 0o644);
    const beforeStat = await stat(manifestPath);
    // oxlint-disable-next-line no-bitwise
    expect(beforeStat.mode & 0o777).toBe(0o644);

    // Second prepareChild rewrites it — the post-write chmod must
    // restore the tight mode.
    await prepareChild(makeConfig(entryPath), cacheDir);
    const afterStat = await stat(manifestPath);
    // oxlint-disable-next-line no-bitwise
    expect(afterStat.mode & 0o777).toBe(0o600);
  });
});

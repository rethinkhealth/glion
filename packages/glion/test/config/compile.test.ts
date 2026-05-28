import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileConfig } from "../../src/config/compile.js";

let dir: string;
let cacheDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-compile-"));
  cacheDir = join(dir, ".glion");
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("compileConfig", () => {
  it("strips types from a TS config and produces importable JS", async () => {
    const src = join(dir, "glion.config.ts");
    await writeFile(
      src,
      `const port: number = 2575;\nexport default { port };`
    );

    const outPath = await compileConfig(src, cacheDir);
    const mod = (await import(pathToFileURL(outPath).href)) as {
      default: unknown;
    };
    expect(mod.default).toEqual({ port: 2575 });
  });

  it("preserves import statements unchanged — imports are NOT bundled", async () => {
    // The whole point of using rolldown's `transform()` (not `build()`)
    // is to keep imports as-is. At runtime the compiled .mjs is loaded
    // by Node which resolves bare specifiers like `zod` through the
    // normal module graph.
    const src = join(dir, "glion.config.ts");
    await writeFile(
      src,
      `import { z } from "zod";\nexport default z.string();`
    );

    const outPath = await compileConfig(src, cacheDir);
    const code = await readFile(outPath, "utf8");
    expect(code).toContain(`from "zod"`);
  });

  it("writes the output into cacheDir with a matching stem and .mjs extension", async () => {
    const src = join(dir, "my.named.config.ts");
    await writeFile(src, "export default {};");

    const outPath = await compileConfig(src, cacheDir);
    // stem strips the trailing .ts — "my.named.config" is retained,
    // then `.mjs` is appended. Output must live under cacheDir.
    expect(basename(outPath)).toBe("my.named.config.mjs");
    expect(outPath.startsWith(cacheDir)).toBe(true);
  });

  it("writes the compiled file with mode 0600 (owner-only read/write)", async () => {
    // The compiled config is `glion.config.ts` with TS types stripped.
    // If the user hard-codes a TLS passphrase (or other secret) into
    // the config, it survives the transform and ends up on disk. Mode
    // 0600 mirrors the manifest's posture — defense in depth on top
    // of the cache dir's 0700.
    const src = join(dir, "glion.config.ts");
    await writeFile(src, "export default {};");

    const outPath = await compileConfig(src, cacheDir);
    const info = await stat(outPath);
    // oxlint-disable-next-line no-bitwise
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("tightens perms on an existing permissive compiled file (upgrade path)", async () => {
    // `writeFile(..., { mode })` only applies on CREATE. A pre-
    // existing compiled config from before this hardening would keep
    // its old (permissive) mode when re-written. The explicit chmod
    // after the write closes that upgrade path.
    const src = join(dir, "glion.config.ts");
    await writeFile(src, "export default {};");

    // First run to create the compiled file, then deliberately loosen
    // its perms to simulate a pre-upgrade state.
    const firstOut = await compileConfig(src, cacheDir);
    await chmod(firstOut, 0o644);
    const beforeStat = await stat(firstOut);
    // oxlint-disable-next-line no-bitwise
    expect(beforeStat.mode & 0o777).toBe(0o644);

    // Re-compile — compileConfig must re-apply the tight mode.
    const secondOut = await compileConfig(src, cacheDir);
    expect(secondOut).toBe(firstOut);
    const afterStat = await stat(secondOut);
    // oxlint-disable-next-line no-bitwise
    expect(afterStat.mode & 0o777).toBe(0o600);
  });

  it("compiles a .mts file (ESM TypeScript)", async () => {
    const src = join(dir, "glion.config.mts");
    await writeFile(src, `export default { port: 3000 };`);

    const outPath = await compileConfig(src, cacheDir);
    const mod = (await import(pathToFileURL(outPath).href)) as {
      default: { port: number };
    };
    expect(mod.default.port).toBe(3000);
  });

  it("passes through a .js file unchanged in effect (no types to strip)", async () => {
    const src = join(dir, "glion.config.js");
    await writeFile(src, `export default { port: 4000 };`);

    const outPath = await compileConfig(src, cacheDir);
    const mod = (await import(pathToFileURL(outPath).href)) as {
      default: { port: number };
    };
    expect(mod.default.port).toBe(4000);
  });

  it("throws when the source has a syntax error", async () => {
    const src = join(dir, "glion.config.ts");
    await writeFile(src, "export default { port: <<< not valid");

    await expect(compileConfig(src, cacheDir)).rejects.toBeDefined();
  });

  it("passes a single compile error through as-is (preserves the original shape)", async () => {
    // When rolldown returns exactly one error, compileConfig should
    // throw that value unchanged — no AggregateError wrapping — so
    // the original diagnostic structure (loc, source snippet, …)
    // survives for downstream formatting. AggregateError would bury
    // that detail behind `.errors[0]`.
    const src = join(dir, "glion.config.ts");
    await writeFile(src, "export default { port: <<< not valid");

    try {
      await compileConfig(src, cacheDir);
      expect.fail("should have thrown");
    } catch (error) {
      // AggregateError is Node's native multi-error container; we
      // must NOT see it here — only the underlying single error.
      expect(error).not.toBeInstanceOf(AggregateError);
      // And it should be an Error (rolldown returns an Error-shaped
      // value; our toError helper coerces anything else up to one).
      expect(error).toBeInstanceOf(Error);
    }
  });
});

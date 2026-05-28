import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONFIG_FILENAMES, discoverConfig } from "../../src/config/discover.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-discover-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("discoverConfig", () => {
  it("returns null when the directory has no recognised config file", async () => {
    const result = await discoverConfig(dir);
    expect(result).toBeNull();
  });

  it("returns the absolute path of a glion.config.ts when present", async () => {
    const expected = join(dir, "glion.config.ts");
    await writeFile(expected, "export default { entry: './a.ts' };");

    const result = await discoverConfig(dir);
    expect(result).toBe(expected);
  });

  it("picks glion.config.ts over glion.config.js when both exist", async () => {
    const ts = join(dir, "glion.config.ts");
    const js = join(dir, "glion.config.js");
    await writeFile(ts, "export default {};");
    await writeFile(js, "export default {};");

    const result = await discoverConfig(dir);
    expect(result).toBe(ts);
  });

  it("walks the priority list — .mts is chosen when .ts is absent", async () => {
    const mts = join(dir, "glion.config.mts");
    const mjs = join(dir, "glion.config.mjs");
    const js = join(dir, "glion.config.js");
    // Write all three of the lower-priority variants. discover must
    // return the highest-priority one that exists (.mts).
    await writeFile(mts, "export default {};");
    await writeFile(mjs, "export default {};");
    await writeFile(js, "export default {};");

    const result = await discoverConfig(dir);
    expect(result).toBe(mts);
  });

  it("returns .js only when all higher-priority variants are absent", async () => {
    const js = join(dir, "glion.config.js");
    await writeFile(js, "module.exports = {};");

    const result = await discoverConfig(dir);
    expect(result).toBe(js);
  });

  it("does NOT walk up into the parent directory", async () => {
    // Put a config in the temp root, then search a sibling subdirectory
    // that has no config of its own. discover must NOT find the ancestor —
    // that's the security property this function is built around.
    await writeFile(join(dir, "glion.config.ts"), "export default {};");
    const child = join(dir, "subproject");
    await mkdir(child);

    const result = await discoverConfig(child);
    expect(result).toBeNull();
  });

  it("skips a filename that exists but is not readable", async () => {
    // A file without read permission fails access(R_OK) and the
    // search continues to the next candidate. Verify that behaviour
    // rather than erroring the whole discovery — a user with a
    // broken permissions on one variant still gets the next one.
    const ts = join(dir, "glion.config.ts");
    const js = join(dir, "glion.config.js");
    await writeFile(ts, "export default {};");
    await writeFile(js, "export default {};");
    // Revoke read on the .ts variant. The next candidate (.mts) doesn't
    // exist; the one after (.mjs) doesn't either; .js should win.
    await chmod(ts, 0o000);

    try {
      const result = await discoverConfig(dir);
      expect(result).toBe(js);
    } finally {
      // Restore perms so the afterEach cleanup (`rm -rf`) works.
      await chmod(ts, 0o600);
    }
  });

  it("exports CONFIG_FILENAMES in the order discover scans them", () => {
    // The filename list is part of the public contract — the loader
    // quotes it in "config-not-found" error context ("tried: ...").
    // Lock in the exact order + extensions so a reorder or removal
    // here is a visible break.
    expect(CONFIG_FILENAMES).toEqual([
      "glion.config.ts",
      "glion.config.mts",
      "glion.config.mjs",
      "glion.config.js",
    ]);
  });
});

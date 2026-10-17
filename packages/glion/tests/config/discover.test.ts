import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONFIG_FILENAMES,
  discoverConfig,
  discoverEntry,
  ENTRY_FILENAMES,
} from "../../src/config/discover";

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
    // The filename list is part of the public contract — it is what the
    // README and `glion --help` tell people to name their config.
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

describe("discoverEntry", () => {
  it("returns null when the directory has no conventional app file", async () => {
    expect(await discoverEntry(dir)).toBeNull();
  });

  it("returns the absolute path of a root glion.app.ts", async () => {
    const expected = join(dir, "glion.app.ts");
    await writeFile(expected, "export default {};");

    expect(await discoverEntry(dir)).toBe(expected);
  });

  it("returns src/glion.app.ts when the root has none", async () => {
    await mkdir(join(dir, "src"));
    const expected = join(dir, "src", "glion.app.ts");
    await writeFile(expected, "export default {};");

    expect(await discoverEntry(dir)).toBe(expected);
  });

  it("prefers the root app file over the one under src/", async () => {
    const root = join(dir, "glion.app.ts");
    await mkdir(join(dir, "src"));
    await writeFile(root, "export default {};");
    await writeFile(join(dir, "src", "glion.app.ts"), "export default {};");

    expect(await discoverEntry(dir)).toBe(root);
  });

  it("does not walk above cwd", async () => {
    const project = join(dir, "project");
    await mkdir(project);
    await writeFile(join(dir, "glion.app.ts"), "export default {};");

    expect(await discoverEntry(project)).toBeNull();
  });

  it("exports ENTRY_FILENAMES in the order discover scans them", () => {
    expect(ENTRY_FILENAMES).toEqual(["glion.app.ts", "src/glion.app.ts"]);
  });
});

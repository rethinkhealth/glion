import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Mllp } from "@glion/mllp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEntry } from "../../src/child/load-entry.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-load-entry-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
  // Clean up the global handoff slot so tests don't leak into each other.
  delete (globalThis as { __glionTestEntry?: unknown }).__glionTestEntry;
});

/**
 * Writes a `.mjs` entry file in the temp dir and returns its absolute
 * path. We use a unique filename per call so Node's ESM module cache
 * doesn't serve stale content between tests.
 */
async function writeEntry(name: string, source: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, source);
  return path;
}

describe("loadEntry", () => {
  it("returns the default export when it is an Mllp instance", async () => {
    // Hand the Mllp instance to the imported module via globalThis —
    // Node's ESM loader shares globals with the test, and Mllp class
    // identity is preserved because both the test and load-entry import
    // from the same `@glion/mllp` package (deduped by the
    // module cache).
    const mllp = new Mllp();
    (globalThis as { __glionTestEntry?: unknown }).__glionTestEntry = mllp;
    const entry = await writeEntry(
      "valid.mjs",
      `export default globalThis.__glionTestEntry;`
    );

    const result = await loadEntry(entry);

    expect(result).toBeInstanceOf(Mllp);
    expect(result).toBe(mllp);
  });

  it("throws GlionError('entry-load-failed') when the file does not exist", async () => {
    const missing = join(dir, "does-not-exist.mjs");

    await expect(loadEntry(missing)).rejects.toMatchObject({
      kind: "entry-load-failed",
    });
  });

  it("throws GlionError('entry-load-failed') when the file has a syntax error", async () => {
    const entry = await writeEntry(
      "broken.mjs",
      `this is not valid javascript {{{`
    );

    await expect(loadEntry(entry)).rejects.toMatchObject({
      kind: "entry-load-failed",
    });
  });

  it("throws GlionError('entry-not-mllp-instance') when the default export is a plain object", async () => {
    const entry = await writeEntry(
      "wrong-shape.mjs",
      `export default { handle: () => {} };`
    );

    await expect(loadEntry(entry)).rejects.toMatchObject({
      kind: "entry-not-mllp-instance",
    });
  });

  it("throws GlionError('entry-not-mllp-instance') when there is no default export", async () => {
    const entry = await writeEntry(
      "no-default.mjs",
      `export const named = 42;`
    );

    await expect(loadEntry(entry)).rejects.toMatchObject({
      kind: "entry-not-mllp-instance",
    });
  });
});

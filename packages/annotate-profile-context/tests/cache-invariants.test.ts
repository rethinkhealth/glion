/**
 * Cache and memory invariants of the profile context: per-file Maps hold
 * references into the shared LRU cache (never copies), sizes scale with
 * unique segment types, and a second run on the same file bails.
 *
 * Converted from assertion-shaped "benchmarks" — these are behavioral
 * contracts, so they live here where failure is loud and attributable.
 */
import { c, f, m, s } from "@glion/builder";
import { profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { hl7v2AnnotateProfileContext } from "../src";
import type { ProfileContext } from "../src";

function msh() {
  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(""),
    f(c("ADT"), c("A01"), c("ADT_A01")),
    f("MSG001"),
    f("P"),
    f("2.5")
  );
}

function pid() {
  return s("PID", f("1"), f(""), f("12345"), f(""), f(c("Doe"), c("John")));
}

function obx(index: number) {
  return s(
    "OBX",
    f(String(index)),
    f("NM"),
    f(c("8302-2"), c("Body Height"), c("LN")),
    f(""),
    f("185"),
    f(c("cm"), c("Centimeter"), c("UCUM"))
  );
}

const processor = unified().use(hl7v2AnnotateProfileContext);

function requireProfile(file: VFile): ProfileContext {
  const profile = file.data.profile;
  if (!profile) {
    throw new Error("file.data.profile was not populated");
  }
  return profile;
}

describe("shared references with the LRU cache", () => {
  it("fields entries are the same objects as the cache's", async () => {
    const file = new VFile();
    await processor.run(m(msh(), pid()), file);
    const profile = requireProfile(file);

    expect(profile.fields.get("MSH")).toBe(
      await profiles.fields.load("2.5", "MSH")
    );
    expect(profile.fields.get("PID")).toBe(
      await profiles.fields.load("2.5", "PID")
    );
  });

  it("datatypes entries are the same objects as the cache's", async () => {
    const file = new VFile();
    await processor.run(m(msh(), pid()), file);

    expect(requireProfile(file).datatypes.get("ST")).toBe(
      await profiles.datatypes.load("2.5", "ST")
    );
  });

  it("tables entries are the same objects as the cache's", async () => {
    const file = new VFile();
    await processor.run(m(msh(), pid()), file);
    const profile = requireProfile(file);

    const [firstTableId] = profile.tables.keys();
    if (firstTableId === undefined) {
      throw new Error("no tables were loaded");
    }
    expect(profile.tables.get(firstTableId)).toBe(
      await profiles.tables.load("2.5", firstTableId)
    );
  });

  it("two messages share profile object references", async () => {
    const file1 = new VFile();
    const file2 = new VFile();
    await processor.run(m(msh(), pid()), file1);
    await processor.run(m(msh(), pid()), file2);
    const profile1 = requireProfile(file1);
    const profile2 = requireProfile(file2);

    expect(profile1.fields).not.toBe(profile2.fields);
    expect(profile1.fields.get("MSH")).toBe(profile2.fields.get("MSH"));
    expect(profile1.fields.get("PID")).toBe(profile2.fields.get("PID"));
    expect(profile1.datatypes.get("ST")).toBe(profile2.datatypes.get("ST"));
  });

  it("many retained files all reference the same profile objects", async () => {
    const files: VFile[] = [];
    for (let i = 0; i < 100; i++) {
      const file = new VFile();
      await processor.run(m(msh(), pid()), file);
      files.push(file);
    }

    const firstMsh = requireProfile(files[0] as VFile).fields.get("MSH");
    expect(firstMsh).toBeDefined();
    for (const file of files) {
      expect(requireProfile(file).fields.get("MSH")).toBe(firstMsh);
    }
  });
});

describe("per-message overhead", () => {
  it("Maps contain only entries for unique segment types", async () => {
    const segments = [msh(), pid()];
    for (let i = 1; i <= 10; i++) {
      segments.push(obx(i));
    }
    const file = new VFile();
    await processor.run(m(...segments), file);
    const profile = requireProfile(file);

    // 12 segments, but only 3 unique segment types
    expect(profile.fields.size).toBe(3);
    expect(profile.datatypes.size).toBeGreaterThan(0);
    expect(profile.tables.size).toBeGreaterThan(0);
  });

  it("Map sizes scale with unique segment types, not total count", async () => {
    const smallFile = new VFile();
    await processor.run(m(msh(), pid(), obx(1)), smallFile);

    const largeSegments = [msh(), pid()];
    for (let i = 1; i <= 50; i++) {
      largeSegments.push(obx(i));
    }
    const largeFile = new VFile();
    await processor.run(m(...largeSegments), largeFile);

    const small = requireProfile(smallFile);
    const large = requireProfile(largeFile);
    expect(large.fields.size).toBe(small.fields.size);
    expect(large.datatypes.size).toBe(small.datatypes.size);
    expect(large.tables.size).toBe(small.tables.size);
  });
});

describe("idempotency", () => {
  it("a second run on the same file keeps the same profile object", async () => {
    const tree = m(msh(), pid());
    const file = new VFile();
    await processor.run(tree, file);
    const first = requireProfile(file);

    await processor.run(tree, file);
    expect(requireProfile(file)).toBe(first);
  });
});

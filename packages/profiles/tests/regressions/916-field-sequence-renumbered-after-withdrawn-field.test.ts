/**
 * Regression for https://github.com/rethinkhealth/glion/issues/916.
 *
 * Date: 2026-10-10
 * Symptom: from v2.6 on, `bySequence` of a field definition returned the
 * wrong field after a withdrawn one: v2.6 DG1 sequence 2 was `DG1-3`, and
 * v2.7.1 PID sequence 14 was `PID-18`. 2,343 field profiles across 28
 * segments were affected.
 * Cause: the v2.6+ XML schemas leave out the fields HL7 withdrew, and the
 * generator gave each field the sequence of its place in that list.
 * Resolution: the generator takes each field's sequence from HL7DB and keeps
 * the withdrawn fields.
 */

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fields } from "../../src/stores/fields";

const VERSIONS = [
  "2.1",
  "2.2",
  "2.3",
  "2.3.1",
  "2.4",
  "2.5",
  "2.5.1",
  "2.6",
  "2.7",
  "2.7.1",
  "2.8",
  "2.8.1",
  "2.8.2",
] as const;

const JSON_EXTENSION = /\.json$/;

const segmentIdsOf = async (version: string): Promise<string[]> => {
  const dir = fileURLToPath(
    new URL(`../../src/profiles/v${version}/fields/`, import.meta.url)
  );
  const names = await readdir(dir);
  return names
    .filter((name) => JSON_EXTENSION.test(name))
    .map((name) => name.replace(JSON_EXTENSION, ""));
};

describe("field definitions by sequence", () => {
  it("give v2.6 DG1-3 at sequence 3, after the withdrawn DG1-2", async () => {
    const dg1 = await fields.load("2.6", "DG1");

    expect(dg1?.bySequence.get(2)?.id).toBe("DG1-2");
    expect(dg1?.bySequence.get(3)?.id).toBe("DG1-3");
  });

  it("give v2.7.1 PID-18 at sequence 18", async () => {
    const pid = await fields.load("2.7.1", "PID");

    expect(pid?.bySequence.get(18)?.id).toBe("PID-18");
  });

  it.each(VERSIONS)(
    "give every v%s field at the sequence in its ID",
    async (version) => {
      const misplaced: string[] = [];
      for (const segmentId of await segmentIdsOf(version)) {
        const definition = await fields.load(version, segmentId);
        for (const [sequence, field] of definition?.bySequence ?? []) {
          if (field.id !== `${segmentId}-${sequence}`) {
            misplaced.push(`${field.id} at ${sequence}`);
          }
        }
      }

      expect(misplaced).toEqual([]);
    }
  );
});

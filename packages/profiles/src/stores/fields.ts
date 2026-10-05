import { memoize } from "../memoize";
import { fieldImports } from "../profiles/field-manifest";
import type { ProfileStore } from "../types";
import type { FieldDefinition, FieldModule } from "./types";

const index = memoize((raw: FieldModule): FieldDefinition => {
  const bySequence = new Map<number, (typeof raw.fields)[number]>();
  const requiredSequences = new Set<number>();

  for (const field of raw.fields) {
    bySequence.set(field.sequence, field);
    if (field.required) {
      requiredSequences.add(field.sequence);
    }
  }

  return {
    bySequence,
    requiredSequences,
    segmentId: raw.segmentId,
  };
});

/** The loader of segment field profiles. */
export const fields: ProfileStore<FieldDefinition> = {
  load: async (version, segmentId) => {
    const key = `v${version}/${segmentId}`;
    const importFields = fieldImports[key];
    if (!importFields) {
      throw new Error(`Unknown fields profile: ${key}`);
    }
    return index(await importFields());
  },
};

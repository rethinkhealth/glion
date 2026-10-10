import type { ProfileStore } from "../profiles";
import { memoize } from "../utils";
import { lazyImport } from "./utils";

/** Raw shape exported by generated field modules. */
export type FieldModule = Readonly<{
  segmentId: string;
  fields: readonly FieldProfile[];
}>;

/** Field validation constraints for a single field within a segment. */
export type FieldProfile = Readonly<{
  sequence: number;
  id: string;
  required: boolean;
  repeatable: boolean;
  /** Absent on a withdrawn field the standard gives no datatype. */
  datatype?: string;
  maxLength?: number;
  table?: string;
  name?: string;
  item?: string;
}>;

/**
 * Compiled field definition for a segment.
 * Returned by `profiles.fields.load()`.
 */
export type FieldDefinition = Readonly<{
  segmentId: string;
  /** O(1) lookup of field profile by sequence number. */
  bySequence: ReadonlyMap<number, FieldProfile>;
  /** O(1) check for required field sequences. */
  requiredSequences: ReadonlySet<number>;
}>;

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
    const raw = await lazyImport<FieldModule>(
      `../profiles/v${version}/fields/${segmentId}.json`
    );
    return raw === undefined ? undefined : index(raw);
  },
};

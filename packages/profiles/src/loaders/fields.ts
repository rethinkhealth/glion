import { fieldImports } from "../profiles/field-manifest";
import { loaderByVersion, versionAndId } from "./load";
import type { FieldDefinition, FieldModule } from "./types";

/** Compile raw field module into indexed definition. */
const compileFields = (raw: FieldModule): FieldDefinition => {
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
};

/**
 * The field definitions of every segment in an HL7v2 version, by segment ID,
 * or `undefined` for a version not bundled.
 */
export const loadFields: (
  version: string
) => Promise<ReadonlyMap<string, FieldDefinition> | undefined> =
  loaderByVersion(fieldImports, versionAndId, compileFields);

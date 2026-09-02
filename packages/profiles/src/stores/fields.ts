import { fieldImports } from "../profiles/field-manifest";
import type { ProfileStoreConfig } from "../store";
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

/** Store configuration for segment field profiles. */
export const fieldsConfig: ProfileStoreConfig<FieldModule, FieldDefinition> = {
  compile: compileFields,
  manifest: fieldImports,
  namespace: "fields",
};

import { datatypeImports } from "../profiles/datatype-manifest";
import { loaderByVersion, versionAndId } from "./load";
import type {
  ComponentProfile,
  DatatypeDefinition,
  DatatypeModule,
} from "./types";

/** Compile raw datatype module into indexed definition. */
const compileDatatypes = (raw: DatatypeModule): DatatypeDefinition => {
  const componentsBySequence = new Map<number, ComponentProfile>();
  const requiredSequences = new Set<number>();

  for (const component of raw.components) {
    componentsBySequence.set(component.sequence, component);
    if (component.required) {
      requiredSequences.add(component.sequence);
    }
  }

  return {
    componentsBySequence,
    id: raw.id,
    kind: raw.kind,
    requiredSequences,
    title: raw.title,
    version: raw.version,
  };
};

/**
 * The datatype definitions of an HL7v2 version, by datatype ID, or `undefined`
 * for a version not bundled.
 */
export const loadDatatypes: (
  version: string
) => Promise<ReadonlyMap<string, DatatypeDefinition> | undefined> =
  loaderByVersion(datatypeImports, versionAndId, compileDatatypes);

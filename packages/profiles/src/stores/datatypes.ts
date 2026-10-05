import { memoize } from "../memoize";
import { datatypeImports } from "../profiles/datatype-manifest";
import type { ProfileStore } from "../types";
import type {
  ComponentProfile,
  DatatypeDefinition,
  DatatypeModule,
} from "./types";

const index = memoize((raw: DatatypeModule): DatatypeDefinition => {
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
});

/** The loader of datatype profiles. */
export const datatypes: ProfileStore<DatatypeDefinition> = {
  load: async (version, datatypeId) => {
    const key = `v${version}/${datatypeId}`;
    const importDatatype = datatypeImports[key];
    if (!importDatatype) {
      throw new Error(`Unknown datatypes profile: ${key}`);
    }
    return index(await importDatatype());
  },
};

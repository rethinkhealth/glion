import type { ProfileStoreConfig } from "../store";
import type { ProfileIndex } from "./import-from-index";
import { importFromIndex } from "./import-from-index";
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

const datatypeIndexes = import.meta.glob<ProfileIndex<DatatypeModule>>(
  "../profiles/v*/datatypes/index.ts",
  { import: "default" }
);

/** Store configuration for datatype profiles. */
export const datatypesConfig: ProfileStoreConfig<
  DatatypeModule,
  DatatypeDefinition
> = {
  compile: compileDatatypes,
  importProfile: (version, id) =>
    importFromIndex(datatypeIndexes, `../profiles/v${version}/datatypes`, id),
  namespace: "datatypes",
};

import { datatypeImports } from "../profiles/datatype-manifest";
import type { ProfileStoreConfig } from "../store";
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

/** Store configuration for datatype profiles. */
export const datatypesConfig: ProfileStoreConfig<
  DatatypeModule,
  DatatypeDefinition
> = {
  compile: compileDatatypes,
  manifest: datatypeImports,
  namespace: "datatypes",
};

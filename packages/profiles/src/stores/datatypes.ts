import { memoize } from "../memoize";
import type { ProfileStore } from "../profiles";
import { lazyImport } from "./utils";

/** Raw shape exported by generated datatype modules. */
export type DatatypeModule = Readonly<{
  id: string;
  version: string;
  kind: string;
  title?: string;
  components: readonly ComponentProfile[];
}>;

/** Component validation constraints within a composite datatype. */
export type ComponentProfile = Readonly<{
  sequence: number;
  name: string;
  datatypeId: string;
  required: boolean;
  maxLength?: number;
}>;

/**
 * Compiled datatype definition.
 * Returned by `profiles.datatypes.load()`.
 */
export type DatatypeDefinition = Readonly<{
  id: string;
  version: string;
  kind: string;
  title?: string;
  /** O(1) lookup of component profile by sequence number. */
  componentsBySequence: ReadonlyMap<number, ComponentProfile>;
  /** O(1) check for required component sequences. */
  requiredSequences: ReadonlySet<number>;
}>;

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
    const raw = await lazyImport<DatatypeModule>(
      `../profiles/v${version}/datatypes/${datatypeId}.json`
    );
    if (!raw) {
      throw new Error(`Unknown datatypes profile: v${version}/${datatypeId}`);
    }
    return index(raw);
  },
};

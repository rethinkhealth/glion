import type { Definition } from "./automata/types";
import type {
  CodeSystemDefinition,
  DatatypeDefinition,
  FieldDefinition,
  TableDefinition,
} from "./stores/types";

// ---------------------------------------------------------------------------
// Profile store
// ---------------------------------------------------------------------------

/** The loader of one kind of profile. */
export type ProfileStore<T> = Readonly<{
  /**
   * Loads the profile `id` of `version`. Later loads of the same profile
   * resolve the same value.
   *
   * @throws {Error} When `version` bundles no profile `id`.
   */
  load(version: string, id: string): Promise<T>;
}>;

/** The loader of UTG code systems, which have no HL7v2 version. */
export type CodeSystemStore = Readonly<{
  /**
   * Loads the code system `id`, such as `"v2-0001"`.
   *
   * @throws {Error} When no code system `id` is bundled.
   */
  load(id: string): Promise<CodeSystemDefinition>;
}>;

// ---------------------------------------------------------------------------
// Profiles (top-level)
// ---------------------------------------------------------------------------

/** The profile stores. */
export type Profiles = Readonly<{
  /** DFA definitions for message structure validation. */
  events: ProfileStore<Definition>;
  /** Segment field metadata (required, repeatable, maxLength, datatype). */
  fields: ProfileStore<FieldDefinition>;
  /** Component structure and constraints for datatypes. */
  datatypes: ProfileStore<DatatypeDefinition>;
  /** HL7-defined and user-defined table value sets. */
  tables: ProfileStore<TableDefinition>;
  /** UTG code systems (cumulative, not versioned by HL7v2 version). */
  codeSystems: CodeSystemStore;
}>;

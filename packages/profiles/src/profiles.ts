import type { Definition } from "./automata/types";
import { codeSystems } from "./stores/code-systems";
import type { CodeSystemStore } from "./stores/code-systems";
import { datatypes } from "./stores/datatypes";
import type { DatatypeDefinition } from "./stores/datatypes";
import { events } from "./stores/events";
import { fields } from "./stores/fields";
import type { FieldDefinition } from "./stores/fields";
import { tables } from "./stores/tables";
import type { TableDefinition } from "./stores/tables";

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

/**
 * The profile stores: event profiles, fields, datatypes, and tables by
 * version, and UTG code systems.
 *
 * @example
 *   ```ts
 *   const def = await profiles.events.load("2.5", "ADT_A01");
 *   const fields = await profiles.fields.load("2.5", "PID");
 *   const table = await profiles.tables.load("2.5", "0001");
 *   const codeSystem = await profiles.codeSystems.load("v2-0001");
 *   ```;
 */
export const profiles: Profiles = {
  codeSystems,
  datatypes,
  events,
  fields,
  tables,
};

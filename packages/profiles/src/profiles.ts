import type { EventSchema } from "./engine/types";
import { codeSystems } from "./stores/code-systems";
import type { CodeSystemStore } from "./stores/code-systems";
import { datatypes } from "./stores/datatypes";
import type { DatatypeDefinition } from "./stores/datatypes";
import { eventMaps } from "./stores/event-maps";
import type { EventMapStore } from "./stores/event-maps";
import { events } from "./stores/events";
import { fields } from "./stores/fields";
import type { FieldDefinition } from "./stores/fields";
import { tables } from "./stores/tables";
import type { TableDefinition } from "./stores/tables";

/** The loader of one kind of profile. */
export type ProfileStore<T> = Readonly<{
  /**
   * Loads the profile `id` of `version`, or `undefined` when `version`
   * bundles no profile `id`. Later loads of the same profile resolve the same
   * value.
   *
   * @throws {Error} When a bundled profile fails to load.
   */
  load(version: string, id: string): Promise<T | undefined>;
}>;

/** The profile stores. */
export type Profiles = Readonly<{
  /** Event schemas, such as `ORU_R01`, by version and schema ID. */
  events: ProfileStore<EventSchema>;
  /** Event maps: the event schema each event uses, by version. */
  eventMaps: EventMapStore;
  /** Segment field metadata (optionality, repetitions, maxLength, datatype). */
  fields: ProfileStore<FieldDefinition>;
  /** Component schema and constraints for datatypes. */
  datatypes: ProfileStore<DatatypeDefinition>;
  /** HL7-defined and user-defined table value sets. */
  tables: ProfileStore<TableDefinition>;
  /** UTG code systems (cumulative, not versioned by HL7v2 version). */
  codeSystems: CodeSystemStore;
}>;

/**
 * The profile stores: event schemas, event maps, fields, datatypes, and
 * tables by version, and UTG code systems.
 *
 * @example
 *   ```ts
 *   const schema = await profiles.events.load("2.5", "ADT_A04");
 *   const eventMap = await profiles.eventMaps.load("2.5");
 *   const fields = await profiles.fields.load("2.5", "PID");
 *   const table = await profiles.tables.load("2.5", "0001");
 *   const codeSystem = await profiles.codeSystems.load("v2-0001");
 *   ```;
 */
export const profiles: Profiles = {
  codeSystems,
  datatypes,
  eventMaps,
  events,
  fields,
  tables,
};

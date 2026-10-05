import { codeSystems } from "./stores/code-systems";
import { datatypes } from "./stores/datatypes";
import { events } from "./stores/events";
import { fields } from "./stores/fields";
import { tables } from "./stores/tables";
import type { Profiles } from "./types";

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

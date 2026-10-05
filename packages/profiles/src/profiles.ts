import { createProfileStore } from "./store";
import { codeSystemsConfig } from "./stores/code-systems";
import { datatypesConfig } from "./stores/datatypes";
import { eventsConfig } from "./stores/events";
import { fieldsConfig } from "./stores/fields";
import { tablesConfig } from "./stores/tables";
import type { CodeSystemStore, Profiles } from "./types";

const codeSystems = createProfileStore(codeSystemsConfig);

/**
 * The profile stores: event schemas, fields, datatypes, and tables by
 * version, and UTG code systems.
 *
 * @example
 *   ```ts
 *   const schema = await profiles.events.load("2.5", "ADT_A04");
 *   const fields = await profiles.fields.load("2.5", "PID");
 *   const table = await profiles.tables.load("2.5", "0001");
 *   const codeSystem = await profiles.codeSystems.load("v2-0001");
 *   ```;
 */
export const profiles: Profiles = {
  codeSystems: {
    load: (id) => codeSystems.load("utg", id),
  } satisfies CodeSystemStore,
  datatypes: createProfileStore(datatypesConfig),
  events: createProfileStore(eventsConfig),
  fields: createProfileStore(fieldsConfig),
  tables: createProfileStore(tablesConfig),
};

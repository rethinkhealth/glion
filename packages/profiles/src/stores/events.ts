import { eventMapEntry } from "../event-map-entry";
import { compile } from "../compile";
import type { EventSchema } from "../types";
import type { ProfileStoreConfig } from "../store";
import type { ProfileIndex } from "./import-from-index";
import { importFromIndex } from "./import-from-index";

const schemaIndexes = import.meta.glob<ProfileIndex<EventSchema>>(
  "../profiles/v*/events/index.ts",
  { import: "default" }
);

/** Store configuration for event schemas. */
export const eventsConfig: ProfileStoreConfig<EventSchema> = {
  // Compiling on load makes an invalid schema fail the load, not a later
  // runner() call.
  compile: (schema) => {
    compile(schema);
    return schema;
  },
  importProfile: (version, id) =>
    importFromIndex(schemaIndexes, `../profiles/v${version}/events`, id),
  namespace: "events",
  resolveId: eventMapEntry,
};

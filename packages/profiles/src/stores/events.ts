import type { EventSchema } from "../engine/types";
import type { ProfileStore } from "../profiles";
import { memoize } from "../utils";
import { eventMaps } from "./event-maps";
import { lazyImport } from "./utils";

const freezeDeep = (value: unknown): void => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
    Object.freeze(value);
  }
};

const frozen = memoize((schema: EventSchema): EventSchema => {
  freezeDeep(schema);
  return schema;
});

/**
 * The loader of event schemas. Resolves a trigger event to its schema.
 *
 * A resolved schema is frozen, at every depth.
 */
export const events: ProfileStore<EventSchema> = {
  load: async (version, id) => {
    const eventMap = await eventMaps.load(version);
    if (!eventMap) {
      return;
    }
    const schema = await lazyImport<EventSchema>(
      `../profiles/v${version}/events/${eventMap[id] ?? id}.json`
    );
    return schema && frozen(schema);
  },
};

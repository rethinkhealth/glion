import type { EventSchema } from "../engine/types";
import type { ProfileStore } from "../profiles";
import { eventMaps } from "./event-maps";
import { lazyImport } from "./utils";

/** The loader of event schemas. Resolves a trigger event to its schema. */
export const events: ProfileStore<EventSchema> = {
  load: async (version, id) => {
    const eventMap = await eventMaps.load(version);
    if (!eventMap) {
      return;
    }
    return await lazyImport<EventSchema>(
      `../profiles/v${version}/events/${eventMap[id] ?? id}.json`
    );
  },
};

import type { Definition } from "../automata/types";
import type { ProfileStore } from "../profiles";
import { profileImports } from "../profiles/profile-manifest";
import { eventMaps } from "./event-maps";

/** The loader of event profiles. Resolves a trigger event to its structure. */
export const events: ProfileStore<Definition> = {
  load: async (version, id) => {
    const eventMap = await eventMaps.load(version);
    if (!eventMap) {
      return;
    }
    const importEvent = profileImports[`v${version}/${eventMap[id] ?? id}`];
    if (!importEvent) {
      return;
    }
    return (await importEvent()) as unknown as Definition;
  },
};

import type { Definition } from "../automata/types";
import type { ProfileStore } from "../profiles";
import { eventMaps } from "../profiles/event-map-manifest";
import { profileImports } from "../profiles/profile-manifest";

/** The loader of event profiles. Resolves a trigger event to its structure. */
export const events: ProfileStore<Definition> = {
  load: async (version, id) => {
    const key = `v${version}/${eventMaps[version]?.[id] ?? id}`;
    const importEvent = profileImports[key];
    if (!importEvent) {
      throw new Error(`Unknown events profile: ${key}`);
    }
    return (await importEvent()) as unknown as Definition;
  },
};

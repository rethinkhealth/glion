import type { Definition } from "../automata/types";
import { eventMaps } from "../profiles/event-map-manifest";
import type { ProfileModule } from "../profiles/profile-manifest";
import { profileImports } from "../profiles/profile-manifest";
import type { ProfileStoreConfig } from "../store";

/** Store configuration for event (message structure) profiles. */
export const eventsConfig: ProfileStoreConfig<ProfileModule, Definition> = {
  compile: (raw) => raw as unknown as Definition,
  manifest: profileImports,
  namespace: "events",
  resolveId: (version, id) => eventMaps[version]?.[id],
};

import { eventMaps } from "../profiles/event-map-manifest";
import type { ProfileStoreConfig } from "../store";
import { programOf } from "../structure/compile";
import type { MessageStructure } from "../structure/types";

/** A bundled message structure file. */
export type StructureModule = Readonly<{ default: MessageStructure }>;

/** Lazy loaders for the bundled message structures, keyed by file path. */
export const structureImports: Readonly<
  Record<string, () => Promise<StructureModule>>
> = import.meta.glob<StructureModule>("../profiles/v*/events/*.json");

/** The path `structureImports` keys a structure by. */
export const structurePath = (version: string, id: string): string =>
  `../profiles/v${version}/events/${id}.json`;

/** Store configuration for event (message structure) profiles. */
export const eventsConfig: ProfileStoreConfig<
  StructureModule,
  MessageStructure
> = {
  // Compiling on load makes an invalid structure fail the load, not a later
  // runner() or matchStructure() call.
  compile: ({ default: structure }) => {
    programOf(structure);
    return structure;
  },
  manifest: structureImports,
  manifestKey: structurePath,
  namespace: "events",
  resolveId: (version, id) => eventMaps[version]?.[id],
};

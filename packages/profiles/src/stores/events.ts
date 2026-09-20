import { eventMaps } from "../profiles/event-map-manifest";
import type { ProfileStoreConfig } from "../store";
import { compileStructure } from "../structure/compile";
import type {
  MessageStructure,
  MessageStructureDefinition,
} from "../structure/types";

/** A bundled message structure file. */
export type StructureModule = Readonly<{ default: MessageStructure }>;

const STRUCTURE_PATH = /^\.\.\/profiles\/(v[^/]+)\/events\/([^/]+)\.json$/;

/** Lazy loaders for the bundled message structures, keyed `v<version>/<id>`. */
export const structureImports: Readonly<
  Record<string, () => Promise<StructureModule>>
> = Object.fromEntries(
  Object.entries(
    import.meta.glob<StructureModule>("../profiles/v*/events/*.json")
  ).map(([path, load]) => {
    const [, version, id] = STRUCTURE_PATH.exec(path) as RegExpExecArray;
    return [`${version}/${id}`, load];
  })
);

/** Store configuration for event (message structure) profiles. */
export const eventsConfig: ProfileStoreConfig<
  StructureModule,
  MessageStructureDefinition
> = {
  compile: ({ default: structure }) => ({
    program: compileStructure(structure),
    structure,
  }),
  manifest: structureImports,
  namespace: "events",
  resolveId: (version, id) => eventMaps[version]?.[id],
};

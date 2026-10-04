import type { ProfileStoreConfig } from "../store";
import { structureMaps } from "../structure-maps";
import { programOf } from "../structure/compile";
import type { MessageStructure } from "../structure/types";
import type { ProfileIndex } from "./import-from-index";
import { importFromIndex } from "./import-from-index";

const structureIndexes = import.meta.glob<ProfileIndex<MessageStructure>>(
  "../profiles/v*/structures/index.ts",
  { import: "default" }
);

/** Store configuration for message structure profiles. */
export const structuresConfig: ProfileStoreConfig<MessageStructure> = {
  // Compiling on load makes an invalid structure fail the load, not a later
  // runner() or matchStructure() call.
  compile: (structure) => {
    programOf(structure);
    return structure;
  },
  importProfile: (version, id) =>
    importFromIndex(structureIndexes, `../profiles/v${version}/structures`, id),
  namespace: "structures",
  resolveId: (version, id) => structureMaps[version]?.[id],
};

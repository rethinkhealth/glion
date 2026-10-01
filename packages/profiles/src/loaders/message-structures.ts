import type { MessageStructure } from "../structure/types";
import { loaderByVersion } from "./load";

/** A bundled message structure file. */
type StructureModule = Readonly<{ default: MessageStructure }>;

const STRUCTURE_PATH = /\/v([^/]+)\/events\/([^/]+)\.json$/;

const structureImports = import.meta.glob<StructureModule>(
  "../profiles/v*/events/*.json"
);

/**
 * The message structures of an HL7v2 version, by structure ID such as
 * `"ADT_A01"`, or `undefined` for a version not bundled.
 */
export const loadMessageStructures: (
  version: string
) => Promise<ReadonlyMap<string, MessageStructure> | undefined> =
  loaderByVersion(
    structureImports,
    (path) => {
      const [, version = "", id = ""] = STRUCTURE_PATH.exec(path) ?? [];
      return [version, id];
    },
    (module) => module.default
  );

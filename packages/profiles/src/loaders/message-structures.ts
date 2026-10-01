import type { MessageStructure } from "../structure/types";
import { loaderByVersion } from "./load";

/**
 * The message structures of an HL7v2 version, by structure ID such as
 * `"ADT_A01"`, or `undefined` for a version not bundled.
 */
export const loadMessageStructures: (
  version: string
) => Promise<ReadonlyMap<string, MessageStructure> | undefined> =
  loaderByVersion(
    import.meta.glob<readonly MessageStructure[]>(
      "../profiles/v*/structures.json",
      { import: "default" }
    ),
    (structures) =>
      new Map(structures.map((structure) => [structure.id, structure]))
  );

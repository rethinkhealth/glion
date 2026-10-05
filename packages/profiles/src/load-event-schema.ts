import type { Root } from "@glion/ast";
import { value } from "@glion/util-query";

import { eventMapEntry } from "./event-map-entry";
import { profiles } from "./profiles";
import type { MessageStructure } from "./structure/types";

/**
 * The schema of the event `tree` carries: its message structure.
 *
 * Reads the version from MSH-12.1, and the structure from MSH-9.3, or from the
 * event maps for MSH-9.1 and MSH-9.2 when MSH-9.3 is empty.
 *
 * Never rejects.
 *
 * @param tree - The message.
 * @returns The structure, or `undefined` when MSH-12 or MSH-9 is missing, or
 *   when the version defines no such structure.
 */
export const loadEventSchema = async (
  tree: Root
): Promise<MessageStructure | undefined> => {
  const version = value(tree, "MSH-12.1")?.value;
  if (!version) {
    return undefined;
  }

  const id =
    value(tree, "MSH-9.3")?.value ||
    eventMapEntry(
      version,
      `${value(tree, "MSH-9.1")?.value ?? ""}_${value(tree, "MSH-9.2")?.value ?? ""}`
    );

  if (!id || eventMapEntry(version, id) === undefined) {
    return undefined;
  }

  return await profiles.events.load(version, id);
};

import type { Root } from "@glion/ast";
import { value } from "@glion/util-query";

import { profiles } from "./profiles";
import { eventMaps } from "./profiles/event-map-manifest";
import { resolveMessageStructure } from "./resolve-message-structure";
import type { MessageStructureDefinition } from "./structure/types";

/**
 * The message structure `tree` names, with its compiled program.
 *
 * Reads the version from MSH-12.1, and the structure from MSH-9.3, or from the
 * event maps for MSH-9.1 and MSH-9.2 when MSH-9.3 is empty.
 *
 * Never rejects.
 *
 * @param tree - The message.
 * @returns The definition, or `undefined` when MSH-12 or MSH-9 is missing, or
 *   when the version defines no such structure.
 */
export const loadMessageStructure = async (
  tree: Root
): Promise<MessageStructureDefinition | undefined> => {
  const version = value(tree, "MSH-12.1")?.value;
  if (!version) {
    return undefined;
  }

  const id =
    value(tree, "MSH-9.3")?.value ||
    resolveMessageStructure(
      version,
      value(tree, "MSH-9.1")?.value ?? "",
      value(tree, "MSH-9.2")?.value ?? ""
    );

  if (!id || eventMaps[version]?.[id] === undefined) {
    return undefined;
  }

  return await profiles.events.load(version, id);
};

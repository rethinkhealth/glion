import type { Delimiters, Nodes, Root } from "@glion/ast";
import { delimiters, selectAll } from "@glion/util-query";
import { visit } from "@glion/util-visit";
import { escapes } from "@glion/utils";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

export interface HL7v2EncodeOptions {
  delimiters?: Partial<Delimiters>;
}

/**
 * Unified plugin to write HL7v2 escape sequences in subcomponent literals,
 * for a tree that `@glion/to-hl7v2` writes with `encodeEscapes: false`, as
 * `escapes.write` from `@glion/utils` writes them. MSH-1 and MSH-2 are left
 * as they are.
 *
 * Delimiter resolution order:
 *
 * 1. `options.delimiters` (explicit override)
 * 2. `file.data.delimiters` (set by hl7v2-annotate-delimiters)
 * 3. MSH-1 and MSH-2 of the tree, and `DEFAULT_DELIMITERS` for any they do not
 *    declare
 *
 * @throws {EscapeSequenceError} When a value holds a character that no escape
 *   sequence can write with the delimiters.
 */
export const hl7v2EncodeEscapes: Plugin<[HL7v2EncodeOptions?], Root, Root> =
  (options) => (tree: Root, file: VFile) => {
    const d = {
      ...((file.data.delimiters as Delimiters | undefined) ?? delimiters(tree)),
      ...options?.delimiters,
    };

    const encodingCharacters = new Set<Nodes>(
      [...selectAll(tree, "MSH.1"), ...selectAll(tree, "MSH.2")].map(
        (match) => match.node
      )
    );

    visit(tree, "subcomponent", (node, ancestors) => {
      if (
        node.value === undefined ||
        ancestors.some((ancestor) => encodingCharacters.has(ancestor))
      ) {
        return;
      }
      node.value = escapes.write(node.value, d);
    });

    return tree;
  };

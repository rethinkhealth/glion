import type { Delimiters, Nodes, Root } from "@glion/ast";
import { delimiters, selectAll } from "@glion/util-query";
import { visit } from "@glion/util-visit";
import { escapes } from "@glion/utils";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

export interface HL7v2DecodeOptions {
  delimiters?: Partial<Delimiters>;
}

/**
 * Unified plugin to read HL7v2 escape sequences in subcomponent literals,
 * for a tree parsed with `decodeEscapes: false`, as `escapes.read` from
 * `@glion/utils` reads them. MSH-1 and MSH-2 are left as they are.
 * Idempotent: with the delimiters the parser read the tree with, a tree
 * `@glion/parser` decoded is left as it is.
 *
 * Delimiter resolution order:
 *
 * 1. `options.delimiters` (explicit override)
 * 2. `file.data.delimiters` (set by hl7v2-annotate-delimiters)
 * 3. MSH-1 and MSH-2 of the tree, and `DEFAULT_DELIMITERS` for any they do not
 *    declare
 */
export const hl7v2DecodeEscapes: Plugin<[HL7v2DecodeOptions?], Root, Root> =
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
      node.value = escapes.read(node.value, d);
    });

    return tree;
  };

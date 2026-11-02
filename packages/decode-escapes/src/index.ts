import type { Delimiters, Root } from "@glion/ast";
import { delimiters, select } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
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

    const msh1 = select(tree, "MSH.1")?.node;
    const msh2 = select(tree, "MSH.2")?.node;

    visit(tree, (node) => {
      if (node === msh1 || node === msh2) {
        return SKIP;
      }
      if (node.type === "subcomponent" && node.value !== undefined) {
        node.value = escapes.read(node.value, d);
      }
    });

    return tree;
  };

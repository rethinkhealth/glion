import type { Delimiters, Root } from "@glion/ast";
import { delimiters, select } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
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

    const msh1 = select(tree, "MSH.1")?.node;
    const msh2 = select(tree, "MSH.2")?.node;

    visit(tree, (node) => {
      if (node === msh1 || node === msh2) {
        return SKIP;
      }
      if (node.type === "subcomponent" && node.value !== undefined) {
        node.value = escapes.write(node.value, d);
      }
    });

    return tree;
  };

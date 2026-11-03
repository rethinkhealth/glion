import type { Delimiters, Root } from "@glion/ast";
import { delimiters, msh } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
import { escapes } from "@glion/utils";
import type { Plugin, Processor } from "unified";

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
 * 2. The delimiters MSH-1 and MSH-2 of the tree declare
 * 3. Without a message header segment, the `delimiters` of the processor's
 *    `settings`, or else `|^~\&`
 */
export const hl7v2DecodeEscapes: Plugin<[HL7v2DecodeOptions?], Root, Root> =
  function hl7v2DecodeEscapes(this: Processor, options) {
    return (tree: Root) => {
      const settings = this.data("settings") as
        | { delimiters?: Partial<Delimiters> }
        | undefined;
      const d = {
        ...delimiters(tree, settings?.delimiters),
        ...options?.delimiters,
      };

      const header = msh(tree);
      const msh1 = header?.children[0];
      const msh2 = header?.children[1];

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
  };

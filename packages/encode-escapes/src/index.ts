import type { Delimiters, Root } from "@glion/ast";
import { delimiters, msh } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
import { escapes } from "@glion/utils";
import type { Plugin, Processor } from "unified";

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
 * 2. The delimiters MSH-1 and MSH-2 of the tree declare
 * 3. Without a message header segment, the `delimiters` of the processor's
 *    `settings`, or else `|^~\&`
 *
 * @throws {EscapeSequenceError} When a value holds a character that no escape
 *   sequence can write with the delimiters.
 * @throws {MissingEscapeCharacterError} When a value holds a character that
 *   must be written as an escape sequence, and the delimiters have no escape
 *   character.
 */
export const hl7v2EncodeEscapes: Plugin<[HL7v2EncodeOptions?], Root, Root> =
  function hl7v2EncodeEscapes(this: Processor, options) {
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
          node.value = escapes.write(node.value, d);
        }
      });

      return tree;
    };
  };

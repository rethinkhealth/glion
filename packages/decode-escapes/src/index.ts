import type { Delimiters, Root, Subcomponent } from "@glion/ast";
import { visit } from "@glion/util-visit";
import { DEFAULT_DELIMITERS, escapes } from "@glion/utils";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

export interface HL7v2DecodeOptions {
  delimiters?: Partial<Delimiters>;
}

/**
 * Unified plugin to read HL7v2 escape sequences in subcomponent literals,
 * for a tree parsed with `decodeEscapes: false`, as `escapes.read` from
 * `@glion/utils` reads them. Idempotent: a tree `@glion/parser` decoded is
 * left as it is.
 *
 * Delimiter resolution order:
 *
 * 1. `options.delimiters` (explicit override)
 * 2. `file.data.delimiters` (set by hl7v2-annotate-delimiters)
 * 3. `DEFAULT_DELIMITERS`
 */
export const hl7v2DecodeEscapes: Plugin<[HL7v2DecodeOptions?], Root, Root> =
  (options) => (tree: Root, file: VFile) => {
    const d = {
      ...((file.data.delimiters as Delimiters | undefined) ??
        DEFAULT_DELIMITERS),
      ...options?.delimiters,
    };

    visit(tree, "subcomponent", (node: Subcomponent) => {
      if (node.value !== undefined) {
        node.value = escapes.read(node.value, d);
      }
    });

    return tree;
  };

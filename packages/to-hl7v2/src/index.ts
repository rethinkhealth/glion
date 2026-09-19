import type {
  Component,
  Delimiters,
  Field,
  FieldRepetition,
  Group,
  Nodes,
  Root,
  Segment,
  Subcomponent,
} from "@glion/ast";
import { delimiters as queryDelimiters } from "@glion/util-query";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import type { Plugin } from "unified";
import type { Node } from "unist";
import type { VFile } from "vfile";

export interface Hl7v2ToHl7v2Options {
  /** Append a field delimiter after the last field in each segment. */
  trailingDelimiter?: boolean;
}

/**
 * Unified compiler plugin: HL7v2 AST → HL7v2 string.
 *
 * Reads `file.data.delimiters` if set by hl7v2-annotate-delimiters,
 * otherwise derives from MSH-1/MSH-2 via `delimiters()` for standalone use.
 */
export const hl7v2ToHl7v2: Plugin<[Hl7v2ToHl7v2Options?], Root, string> =
  function hl7v2ToHl7v2(options?: Hl7v2ToHl7v2Options): void {
    // biome-ignore lint/complexity/noUselessThisAlias: unified plugin shape
    const self = this;
    self.compiler = (tree: Node, file: VFile): string =>
      toHl7v2(
        tree as Nodes,
        file.data.delimiters as Delimiters | undefined,
        options
      );
  };

/**
 * Serialize an HL7v2 AST node back to its wire format.
 *
 * Works on any node in the tree — a full Root, a single Segment, or
 * even a lone Field. Delimiters default to the standard set unless
 * overridden or derivable from an MSH segment in the tree.
 */
export function toHl7v2(
  node: Nodes,
  delimiters?: Partial<Delimiters>,
  options?: Hl7v2ToHl7v2Options
): string {
  const d = {
    ...(node.type === "root" ? queryDelimiters(node) : DEFAULT_DELIMITERS),
    ...delimiters,
  };
  const trailing = options?.trailingDelimiter === true;

  // -- leaf & field-level serializers (no options needed) ----------------

  const sub = (s: Subcomponent): string => s.value ?? "";

  const comp = (c: Component): string =>
    ((c.children || []) as Subcomponent[]).map(sub).join(d.subcomponent);

  const rep = (r: FieldRepetition): string =>
    (r.children as Component[]).map(comp).join(d.component);

  const field = (f: Field): string =>
    (f.children as FieldRepetition[]).map(rep).join(d.repetition);

  // -- segment-level serializers ----------------------------------------

  const fields = (parts: string[]): string => {
    const joined = parts.join(d.field);
    return trailing && joined.length > 0 ? `${joined}${d.field}` : joined;
  };

  const segment = (seg: Segment): string => {
    const body = fields(seg.children.map(field));
    if (!seg.name) {
      return body;
    }
    return body ? `${seg.name}${d.field}${body}` : seg.name;
  };

  // MSH-1 is the field separator itself — skip it and emit structurally.
  const msh = (seg: Segment): string => {
    const tail = fields(seg.children.slice(1).map(field));
    return tail.length ? `MSH${d.field}${tail}` : `MSH${d.field}`;
  };

  const line = (seg: Segment): string =>
    seg.name === "MSH" ? msh(seg) : segment(seg);

  const lines = (nodes: readonly (Segment | Group)[]): string[] =>
    nodes.flatMap((child) =>
      child.type === "group" ? lines(child.children) : [line(child)]
    );

  // -- dispatch ----------------------------------------------------------

  switch (node.type) {
    case "root":
    case "group": {
      return lines(node.children as (Segment | Group)[]).join(d.segment);
    }
    case "segment": {
      return line(node);
    }
    case "field": {
      return field(node);
    }
    case "field-repetition": {
      return rep(node);
    }
    case "component": {
      return comp(node);
    }
    case "subcomponent": {
      return sub(node);
    }
    default: {
      const unsupported: never = node;
      throw new Error(`Unsupported node type: ${(unsupported as Node).type}`);
    }
  }
}

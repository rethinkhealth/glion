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
import { DEFAULT_DELIMITERS, encodeEscapes } from "@glion/utils";
import type { Plugin } from "unified";
import type { Node } from "unist";
import type { VFile } from "vfile";

import { SegmentTerminatorError } from "./errors";

export { EscapeSequenceError } from "@glion/utils";
export { SegmentTerminatorError } from "./errors";

export interface Hl7v2ToHl7v2Options {
  /**
   * Write each subcomponent value with its delimiters, escape character, and
   * control characters as escape sequences (`true`, the default), or as it is
   * (`false`). MSH-1 and MSH-2 are written as they are either way.
   */
  encodeEscapes?: boolean;
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
 *
 * A Root or Group writes each segment followed by its `terminator`, so a parsed
 * message is written back as it was read. A Segment on its own is written
 * without one.
 *
 * @throws {EscapeSequenceError} When `encodeEscapes` is on and a value holds a
 *   character that no escape sequence can write with the delimiters.
 * @throws {SegmentTerminatorError} When a segment with an empty `terminator`
 *   is followed by another segment.
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
  const encode = options?.encodeEscapes ?? true;

  // -- leaf & field-level serializers ------------------------------------

  const sub = (s: Subcomponent): string => {
    const value = s.value ?? "";
    return encode ? encodeEscapes(value, d) : value;
  };

  const comp = (c: Component): string =>
    ((c.children || []) as Subcomponent[]).map(sub).join(d.subcomponent);

  const rep = (r: FieldRepetition): string =>
    (r.children as Component[]).map(comp).join(d.component);

  const field = (f: Field): string =>
    (f.children as FieldRepetition[]).map(rep).join(d.repetition);

  // -- segment-level serializers ----------------------------------------

  const segment = (seg: Segment): string => {
    const body = seg.children.map(field).join(d.field);
    return seg.children.length ? `${seg.name}${d.field}${body}` : seg.name;
  };

  // MSH-1 is the field separator itself — skip it and emit structurally.
  // MSH-2 holds the encoding characters, which are never escape sequences.
  // An MSH with no fields, read from `MSH` and a segment terminator, is its
  // Segment ID alone.
  const msh = (seg: Segment): string => {
    if (seg.children.length === 0) {
      return seg.name;
    }
    const [, encodingCharacters, ...rest] = seg.children;
    const parts = rest.map(field);
    if (encodingCharacters) {
      parts.unshift(
        toHl7v2(encodingCharacters, d, { ...options, encodeEscapes: false })
      );
    }
    return `MSH${d.field}${parts.join(d.field)}`;
  };

  const line = (seg: Segment): string =>
    seg.name === "MSH" ? msh(seg) : segment(seg);

  // The segments of a Root or Group, groups included, in the order they are
  // written.
  const segmentsOf = (child: Segment | Group): Segment[] => {
    switch (child.type) {
      case "group": {
        return child.children.flatMap(segmentsOf);
      }
      case "segment": {
        return [child];
      }
    }
  };

  // Each segment, then its terminator. An empty terminator before another
  // segment would join the two: `PID|1` then `ZPI|x` is `PID|1ZPI|x`.
  const segments = (children: readonly (Segment | Group)[]): string => {
    const written = children.flatMap(segmentsOf);
    const last = written.length - 1;
    return written
      .map((seg, index) => {
        if (seg.terminator === "" && index < last) {
          throw new SegmentTerminatorError(seg);
        }
        return `${line(seg)}${seg.terminator}`;
      })
      .join("");
  };

  // -- dispatch ----------------------------------------------------------

  switch (node.type) {
    case "root":
    case "group": {
      return segments(node.children as (Segment | Group)[]);
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

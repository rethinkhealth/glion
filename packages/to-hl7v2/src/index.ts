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
import { header, delimiters as queryDelimiters } from "@glion/util-query";
import { DEFAULT_DELIMITERS, escapes } from "@glion/utils";
import type { Plugin } from "unified";
import type { Node } from "unist";

import { MissingSeparatorError, SegmentTerminatorError } from "./errors";
import type { Separator } from "./errors";

export { EscapeSequenceError, MissingEscapeCharacterError } from "@glion/utils";
export { MissingSeparatorError, SegmentTerminatorError } from "./errors";
export type { Separator } from "./errors";

export interface Hl7v2ToHl7v2Options {
  /**
   * Write each subcomponent value with its separators and control characters
   * as escape sequences (`true`, the default), or as it is
   * (`false`). MSH-1 and MSH-2 are written as they are either way.
   */
  encodeEscapes?: boolean;
}

/**
 * Unified compiler plugin: HL7v2 AST → HL7v2 string.
 *
 * Writes a message with the delimiters its MSH-1 and MSH-2 declare; without a
 * message header segment, with the `delimiters` of the processor's `settings`,
 * or else with `|^~\&`.
 */
export const hl7v2ToHl7v2: Plugin<[Hl7v2ToHl7v2Options?], Root, string> =
  function hl7v2ToHl7v2(options?: Hl7v2ToHl7v2Options): void {
    // biome-ignore lint/complexity/noUselessThisAlias: unified plugin shape
    const self = this;
    self.compiler = (tree: Node): string => {
      const settings = self.data("settings") as
        | { delimiters?: Partial<Delimiters> }
        | undefined;
      return write(
        tree as Nodes,
        tree.type === "root"
          ? queryDelimiters(tree as Root, settings?.delimiters)
          : { ...DEFAULT_DELIMITERS, ...settings?.delimiters },
        options
      );
    };
  };

/**
 * Serialize an HL7v2 AST node back to its wire format.
 *
 * Works on any node in the tree — a full Root, a single Segment, or
 * even a lone Field. A Root is written with the delimiters its MSH-1 and MSH-2
 * declare, as `delimiters()` from `@glion/util-query` reads them, with
 * `delimiters` over them. Any other node is written with `delimiters`, in which
 * a delimiter left out is absent, except `field`, which is `|`; without
 * `delimiters`, with `|^~\&`.
 *
 * A Root or Group writes each segment followed by its `terminator`, so a parsed
 * message is written back as it was read. A Segment on its own is written
 * without one.
 *
 * @throws {EscapeSequenceError} When `encodeEscapes` is on and a value holds a
 *   character that no escape sequence can write with the delimiters.
 * @throws {MissingEscapeCharacterError} When `encodeEscapes` is on, a value
 *   holds a character that must be written as an escape sequence, and the
 *   delimiters have no escape character.
 * @throws {MissingSeparatorError} When a field, field repetition, or component
 *   has more than one child, and the delimiters have no separator to write
 *   them apart.
 * @throws {SegmentTerminatorError} When a segment with an empty `terminator`
 *   is followed by another segment.
 * @throws {TypeError} When a segment of a Root or Group has no `terminator`.
 */
export function toHl7v2(
  node: Nodes,
  delimiters?: Partial<Delimiters>,
  options?: Hl7v2ToHl7v2Options
): string {
  if (node.type === "root") {
    return write(node, { ...queryDelimiters(node), ...delimiters }, options);
  }
  return write(
    node,
    delimiters
      ? { field: DEFAULT_DELIMITERS.field, ...delimiters }
      : DEFAULT_DELIMITERS,
    options
  );
}

/** Writes `node` with the delimiters `d`. */
function write(
  node: Nodes,
  d: Delimiters,
  options: Hl7v2ToHl7v2Options | undefined
): string {
  const encode = options?.encodeEscapes ?? true;

  // -- leaf & field-level serializers ------------------------------------

  const sub = (s: Subcomponent): string => {
    const value = s.value ?? "";
    return encode ? escapes.write(value, d) : value;
  };

  // The children of `parent`, written apart by `separator`.
  const join = (
    parts: string[],
    separator: Separator,
    parent: Field | FieldRepetition | Component
  ): string => {
    const ch = d[separator];
    if (ch !== undefined) {
      return parts.join(ch);
    }
    if (parts.length > 1) {
      throw new MissingSeparatorError(separator, parent);
    }
    return parts[0] ?? "";
  };

  const comp = (c: Component): string =>
    join(((c.children || []) as Subcomponent[]).map(sub), "subcomponent", c);

  const rep = (r: FieldRepetition): string =>
    join((r.children as Component[]).map(comp), "component", r);

  const field = (f: Field): string =>
    join((f.children as FieldRepetition[]).map(rep), "repetition", f);

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
        write(encodingCharacters, d, { ...options, encodeEscapes: false })
      );
    }
    return `MSH${d.field}${parts.join(d.field)}`;
  };

  // Only the message header holds MSH-1 and MSH-2: an MSH later in a message
  // is written as any other segment.
  const headerSegment =
    node.type === "root" || node.type === "group" ? header(node) : node;
  const line = (seg: Segment): string =>
    seg === headerSegment && seg.name === "MSH" ? msh(seg) : segment(seg);

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
        if (typeof seg.terminator !== "string") {
          throw new TypeError(
            "The segment has no `terminator`; every segment has one, an empty string when nothing ends the segment."
          );
        }
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

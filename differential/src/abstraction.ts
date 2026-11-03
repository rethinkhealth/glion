import type { Component, Field, FieldRepetition, Root } from "@glion/ast";

import type {
  SpecField,
  SpecMessage,
  SpecPiece,
  SpecSubcomponent,
} from "./oracle";
import { toSpecSubcomponent } from "./oracle";

// The abstraction function: glion's tree in, the specification's message out.
// Both describe the same text, so this code decides nothing about HL7v2; it
// only lines the two shapes up. A mistake here makes a correct parser look wrong, or a wrong
// one look right, so it is read like a statement.
//
// `MSH|^~\&|a\rPID|1^^2||x~\r`, as glion parses it (node types shortened):
//
//   segment MSH                             terminator "\r"
//     field [rep [comp [sub "|"]]]          MSH-1
//     field [rep [comp [sub "^~\&"]]]       MSH-2
//     field [rep [comp [sub "a"]]]          MSH-3
//   segment PID                             terminator "\r"
//     field [rep [comp [sub "1"]], comp [], comp [sub "2"]]   1^^2
//     field []                                                (empty)
//     field [rep [comp [sub "x"]], rep []]                    x~
//
// and as the specification's message:
//
//   { delimiters: "|^~\&",
//     header:   [ [[["a"]]] ],
//     segments: [ { id: "PID",
//                   fields: [ [[["1"], [""], ["2"]]],
//                             [[[""]]],
//                             [[["x"]], [[""]]] ] } ] }
//
// Four differences, handled below:
//
// 1. MSH-1 and MSH-2 are fields in glion's tree; in the specification they are
//    the delimiters, and `header` starts at MSH-3.
// 2. glion writes an empty component, repetition or field with no children;
//    the specification writes it as one empty element of the level below,
//    because its rules forbid an empty list at any level
//    (`well_formed_field_has_repetition` and the two after it).
// 3. glion records what ended each segment; the specification ends every
//    segment with `\r`, so `terminator` is checked and dropped.
// 4. glion's value is one string. It decodes the four separator sequences
//    and the `\Xdd\` of each character below U+0020 into characters, and
//    keeps every other sequence as its text, `\E\` included (ADR 0036). The
//    specification's value holds characters and sequences apart, so the
//    string is read back into pieces by glion's own convention:
//
//      "240*" → "240*"
//      "a&b" → "a&b"      `a\T\b`, decoded
//      "a\nb" → "a\nb"    `a\X0A\b`, decoded
//      "a\E\b" → "a\b"    the escape character, kept as written
//      "\H\240*\N\" → [{ sequence: "H" }, "240*", { sequence: "N" }]
//      "a\rb" → ["a", { sequence: "X0D" }, "b"]
//      "a\b" → "a\b"     no closing escape character: data
//
//    A carriage return is the one character glion decodes that the
//    specification does not: it writes no carriage return in data, and keeps
//    `\X0D\` as a sequence.
//
// The mapping is one to one. The parser gives a node children only when the
// text forces them (README of `@glion/parser`, "Empty-field representation"),
// so a lone empty child is another tree for the same text:
//
//   field [rep []]   field [rep [comp []]]   field [rep [comp [sub ""]]]
//
// Each would map to [[[""]]] and hide a parser that wrote it; each throws.

// glion's string, read as the pieces it stands for (difference 4 above).
const subcomponent = (value: string, escape: string): SpecSubcomponent => {
  const pieces: SpecPiece[] = [];
  let i = 0;
  while (i < value.length) {
    const end = value.indexOf(escape, i + 1);
    if (value[i] === escape && end !== -1) {
      const code = value.slice(i + 1, end);
      pieces.push(code === "E" ? escape : { sequence: code });
      i = end + 1;
    } else if (value[i] === "\r") {
      pieces.push({ sequence: "X0D" });
      i += 1;
    } else {
      pieces.push(value.charAt(i));
      i += 1;
    }
  }
  return toSpecSubcomponent(pieces);
};

// An empty component (`^^`) has no subcomponents in glion: [] → [""].
const component = (node: Component, escape: string): SpecSubcomponent[] => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.value === "") {
    throw new Error(
      "The tree holds a component whose only subcomponent is empty; the parser writes an empty component with no subcomponents."
    );
  }
  return node.children.length === 0
    ? [""]
    : node.children.map((s) => subcomponent(s.value, escape));
};

// An empty repetition (`x~`) has no components in glion: [] → [[""]].
const repetition = (
  node: FieldRepetition,
  escape: string
): SpecSubcomponent[][] => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.children.length === 0) {
    throw new Error(
      "The tree holds a repetition whose only component is empty; the parser writes an empty repetition with no components."
    );
  }
  return node.children.length === 0
    ? [[""]]
    : node.children.map((c) => component(c, escape));
};

// An empty field (`||`) has no repetitions in glion: [] → [[[""]]].
const field = (node: Field, escape: string): SpecField => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.children.length === 0) {
    throw new Error(
      "The tree holds a field whose only repetition is empty; the parser writes an empty field with no repetitions."
    );
  }
  return node.children.length === 0
    ? [[[""]]]
    : node.children.map((r) => repetition(r, escape));
};

/**
 * The specification's message for a tree glion parsed: MSH-1 and MSH-2 become
 * the delimiters, the other MSH fields the header, and each later segment its
 * ID and fields.
 */
export const toSpecMessage = (tree: Root): SpecMessage => {
  // The specification's message always has an MSH; every later segment is in
  // `rest`.
  const [msh, ...rest] = tree.children;
  if (msh?.type !== "segment" || msh.name !== "MSH") {
    throw new Error("The tree does not start with an MSH segment.");
  }
  // The one value MSH-1 and MSH-2 hold: field → repetition → component →
  // subcomponent. The parser reads them raw, never splitting `^~\&` on its
  // own delimiters.
  const value = (node: Field | undefined) =>
    node?.children[0]?.children[0]?.children[0]?.value ?? "";

  // A segment the text ended with `\n`, `\r\n` or nothing is another text,
  // which the specification never writes.
  for (const segment of tree.children) {
    if (segment.type === "segment" && segment.terminator !== "\r") {
      throw new Error(
        "The tree holds a segment that does not end with a carriage return; the specification ends every segment with one."
      );
    }
  }

  // "|" + "^~\&" → "|^~\&": field separator, then the encoding characters in
  // their MSH-2 order, the order of the specification's `Delimiters`.
  const delimiters = `${value(msh.children[0])}${value(msh.children[1])}`;
  const escape = delimiters.charAt(3);

  return {
    delimiters,
    // MSH-3 onward; children 0 and 1 are MSH-1 and MSH-2.
    header: msh.children.slice(2).map((f) => field(f, escape)),
    segments: rest.map((segment) => {
      // The specification has no segment groups; a grouping transform would
      // nest segments under a group node.
      if (segment.type !== "segment") {
        throw new Error("The tree holds a group; parse without grouping.");
      }
      // glion keeps the segment ID as `name`, not as a field, so `fields`
      // starts at field 1, as the specification's segment does.
      return {
        fields: segment.children.map((f) => field(f, escape)),
        id: segment.name,
      };
    }),
  };
};

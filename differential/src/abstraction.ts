import type { Component, Field, FieldRepetition, Root } from "@glion/ast";

import type { SpecField, SpecMessage } from "./oracle";

// The abstraction function: glion's tree in, the specification's message out.
// Both describe the same text, so this code decides nothing about HL7v2; it
// only lines the two shapes up. A mistake here makes a correct parser look wrong, or a wrong
// one look right, so it is read like a statement.
//
// `MSH|^~\&|a\rPID|1^^2||x~\r`, as glion parses it (node types shortened):
//
//   segment MSH
//     field [rep [comp [sub "|"]]]          MSH-1
//     field [rep [comp [sub "^~\&"]]]       MSH-2
//     field [rep [comp [sub "a"]]]          MSH-3
//   segment PID
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
// Two differences, handled below:
//
// 1. MSH-1 and MSH-2 are fields in glion's tree; in the specification they are
//    the delimiters, and `header` starts at MSH-3.
// 2. glion writes an empty component, repetition or field with no children;
//    the specification writes it as one empty element of the level below,
//    because its rules forbid an empty list at any level
//    (`well_formed_field_has_repetition` and the two after it).
//
// The mapping is one to one. The parser gives a node children only when the
// text forces them (README of `@glion/parser`, "Empty-field representation"),
// so a lone empty child is another tree for the same text:
//
//   field [rep []]   field [rep [comp []]]   field [rep [comp [sub ""]]]
//
// Each would map to [[[""]]] and hide a parser that wrote it; each throws.

// An empty component (`^^`) has no subcomponents in glion: [] → [""].
const component = (node: Component): string[] => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.value === "") {
    throw new Error(
      "The tree holds a component whose only subcomponent is empty; the parser writes an empty component with no subcomponents."
    );
  }
  return node.children.length === 0 ? [""] : node.children.map((s) => s.value);
};

// An empty repetition (`x~`) has no components in glion: [] → [[""]].
const repetition = (node: FieldRepetition): string[][] => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.children.length === 0) {
    throw new Error(
      "The tree holds a repetition whose only component is empty; the parser writes an empty repetition with no components."
    );
  }
  return node.children.length === 0 ? [[""]] : node.children.map(component);
};

// An empty field (`||`) has no repetitions in glion: [] → [[[""]]].
const field = (node: Field): SpecField => {
  const [only] = node.children;
  if (node.children.length === 1 && only?.children.length === 0) {
    throw new Error(
      "The tree holds a field whose only repetition is empty; the parser writes an empty field with no repetitions."
    );
  }
  return node.children.length === 0 ? [[[""]]] : node.children.map(repetition);
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

  return {
    // "|" + "^~\&" → "|^~\&": field separator, then the encoding characters in
    // their MSH-2 order, the order of the specification's `Delimiters`.
    delimiters: `${value(msh.children[0])}${value(msh.children[1])}`,
    // MSH-3 onward; children 0 and 1 are MSH-1 and MSH-2.
    header: msh.children.slice(2).map(field),
    segments: rest.map((segment) => {
      // The specification has no segment groups; a grouping transform would
      // nest segments under a group node.
      if (segment.type !== "segment") {
        throw new Error("The tree holds a group; parse without grouping.");
      }
      // glion keeps the segment ID as `name`, not as a field, so `fields`
      // starts at field 1, as the specification's segment does.
      return { fields: segment.children.map(field), id: segment.name };
    }),
  };
};

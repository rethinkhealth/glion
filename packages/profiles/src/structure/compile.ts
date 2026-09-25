// Compiles a message structure into a program: a Thompson NFA over segment
// names, stored as plain arrays. `runner()` and `matchStructure()` run it.
//
// The program
// -----------
// States are numbers. Each has an entry in `segments` and one in `edges`.
//
// - A segment state has a name in `segments`. It consumes that segment and
//   moves to the next state number. That move is implicit: the compiler always
//   creates a segment's exit state right after it, so the engines compute
//   `state + 1` and no edge is stored.
// - Every other state has `null` in `segments`. It consumes nothing and moves
//   along its `edges`, each `[target, action]`.
//
// Edge order is priority. Where a message can be read more than one way,
// `matchStructure()` follows a state's edges first to last and keeps the first
// reading that reaches the end. So the order in which edges are added below is
// what decides the grouping: enter an optional element before skipping it,
// repeat an element before leaving it, take the earlier alternative of a
// choice before the later. `runner()` only asks whether any reading exists, so
// the order does not change what it accepts.
//
// An edge's action marks a group boundary: `g + 1` opens group `g`, `-(g + 1)`
// closes it, and `0` does neither. `g` indexes `groups`. The offset by one
// keeps group 0 apart from "no action".
//
// Construction
// ------------
// Every element compiles to a fragment `[start, end]`: states with one way in
// and one way out. Fragments are joined by edges and never merged. That costs
// a few extra states and keeps the three rules independent of each other:
//
//   once(element)         the element, exactly one time
//   occurrences(element)  once(), wrapped for `optional` and `repeating`
//   sequence(elements)    occurrences() of each element, chained in order
//
// Example: `MSH [{ NTE }]` compiles to these states. Numbers follow creation
// order, not the order a message passes through them.
//
//   0       -> 1
//   1  MSH  -> 2          (implicit: segment state, then its exit)
//   2       -> 5
//   5       -> 3, then 6  enter NTE first; skipping it is second
//   3  NTE  -> 4          (implicit)
//   4       -> 3, then 6  repeat NTE first; leaving it is second
//   6                     final
//
// 0 is the sequence's entry. 5 and 6 are the wrapper occurrences() put around
// NTE because it is optional and repeating; MSH is neither and gets none.

import type {
  MessageStructure,
  StructureEdge,
  StructureElement,
  StructureProgram,
} from "./types";

/** A compiled element: enter at `start`, leave from `end`. */
type Fragment = readonly [start: number, end: number];

/** Whether `element` can match zero segments. */
const canMatchNothing = (element: StructureElement): boolean => {
  if (element.optional) {
    return true;
  }
  switch (element.type) {
    case "segment": {
      return false;
    }
    case "group": {
      return element.elements.every(canMatchNothing);
    }
    case "choice": {
      return element.alternatives.some(canMatchNothing);
    }
  }
};

/**
 * Compiles `structure` into the program `runner()` and `matchStructure()` run.
 *
 * The program prefers, in order: entering an optional element over skipping
 * it, repeating an element over leaving it, and earlier choice alternatives
 * over later ones.
 *
 * @throws {Error} When `structure` has no elements, a segment or group has no
 *   name, a group has no elements, a choice has no alternatives, or a choice
 *   alternative can match no segment.
 */
export function compileStructure(
  structure: MessageStructure
): StructureProgram {
  const invalid = (reason: string): Error =>
    new Error(`Invalid message structure ${structure.id}: ${reason}`);

  const groups: string[] = [];
  const segments: (string | null)[] = [];
  const edges: StructureEdge[][] = [];

  // Adds a state and returns its number. With a name, it is a segment state.
  const state = (segment: string | null = null): number => {
    segments.push(segment);
    edges.push([]);
    return segments.length - 1;
  };

  // Adds an edge out of `from`. Call order is priority order.
  const edge = (from: number, target: number, action = 0): void => {
    edges[from]?.push([target, action]);
  };

  // A fresh entry state, then each element's fragment chained end to start.
  const sequence = (elements: readonly StructureElement[]): Fragment => {
    const start = state();
    let end = start;
    for (const element of elements) {
      const [first, last] = occurrences(element);
      edge(end, first);
      end = last;
    }
    return [start, end];
  };

  const once = (element: StructureElement): Fragment => {
    switch (element.type) {
      case "segment": {
        if (!element.name) {
          throw invalid("a segment has no name");
        }
        // The exit must be the very next state: the engines reach it as
        // `start + 1`, without an edge.
        const start = state(element.name);
        return [start, state()];
      }
      case "group": {
        if (!element.name) {
          throw invalid("a group has no name");
        }
        if (element.elements.length === 0) {
          throw invalid(`group ${element.name} has no elements`);
        }
        // `push` returns the new length, which is the group's number plus one:
        // the action that opens it. Its negative closes it.
        const action = groups.push(element.name);
        const [first, last] = sequence(element.elements);
        const start = state();
        const end = state();
        // The body sits between two edges that carry the boundary, so a reading
        // records the group as it enters and as it leaves.
        edge(start, first, action);
        edge(last, end, -action);
        return [start, end];
      }
      case "choice": {
        if (element.alternatives.length === 0) {
          throw invalid("a choice has no alternatives");
        }
        // A choice is exactly one of its alternatives. One that can match
        // nothing makes the choice optional without saying so, and the engines
        // and the reference parser read such a structure differently. Mark the
        // choice `optional` instead.
        if (element.alternatives.some(canMatchNothing)) {
          throw invalid("a choice alternative can match no segment");
        }
        const start = state();
        const end = state();
        // One edge out of `start` per alternative, in the order listed: the
        // first alternative is the preferred one.
        for (const alternative of element.alternatives) {
          const [first, last] = occurrences(alternative);
          edge(start, first);
          edge(last, end);
        }
        return [start, end];
      }
    }
  };

  const occurrences = (element: StructureElement): Fragment => {
    const [first, last] = once(element);

    // Required and single: the element itself, no wrapper.
    if (!(element.optional || element.repeating)) {
      return [first, last];
    }

    // Both pairs below are ordered, and the order is the priority.
    const start = state();
    const end = state();

    // Into the element: enter it, or, if optional, skip it. Entering is added
    // first, so an optional segment that is present is read as that element.
    edge(start, first);
    if (element.optional) {
      edge(start, end);
    }

    // Out of the element: if repeating, go round again, or leave. Repeating
    // is added first, so a second NTE continues the NTE run it follows.
    //
    // A repeating element whose body can match nothing makes a cycle of edges
    // that consume no segment. The engines visit a state once per segment, so
    // the cycle ends there.
    if (element.repeating) {
      edge(last, first);
    }
    edge(last, end);
    return [start, end];
  };

  if (structure.elements.length === 0) {
    throw invalid("it has no elements");
  }
  const [start, final] = sequence(structure.elements);
  return { edges, final, groups, segments, start };
}

// Keyed by the structure object, not by its contents: two equal structures in
// different objects compile separately, and an entry goes when its structure
// is collected.
const programs = new WeakMap<MessageStructure, StructureProgram>();

/**
 * The program of `structure`, compiled on first use and cached by the
 * structure object.
 *
 * @throws {Error} When `structure` is invalid.
 */
export const programOf = (structure: MessageStructure): StructureProgram => {
  let program = programs.get(structure);
  if (!program) {
    program = compileStructure(structure);
    programs.set(structure, program);
  }
  return program;
};

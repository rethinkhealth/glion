// Compiles an event schema into a program: a Thompson NFA over segment
// names, stored as plain arrays. `runner()` runs it.
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
//   along its `edges`, each `[target, boundary]`.
//
// Edge order is priority. Where a message can be read more than one way,
// `runner()` follows a state's edges first to last and keeps the first reading
// that reaches the end. So the order in which edges are added below is what
// decides the grouping: enter an optional element before skipping it, repeat
// an element before leaving it, take the earlier alternative of a choice
// before the later. The order never changes which messages fit, only how they
// group.
//
// An edge's boundary marks where a group opens or closes: `g + 1` opens group
// `g`, `-(g + 1)` closes it, and `0` does neither. `g` indexes `groups`. The
// offset by one keeps group 0 apart from "no boundary".
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

import type { EventSchema, EventSchemaElement } from "./types";

/**
 * An event schema compiled to a Thompson NFA over segment names, stored
 * as parallel arrays indexed by state number.
 *
 * States are numbered from `0`. A state with a non-null entry in `segments`
 * consumes that segment and moves to state `state + 1`, with no edge stored.
 * Every other state consumes nothing and moves along its `edges`.
 */
export type EventSchemaProgram = Readonly<{
  /** The state a message starts in. */
  start: number;
  /** The state that ends a complete message. It has no edges. */
  final: number;
  /** Group names, such as `PATIENT_RESULT`, indexed by group number. */
  groups: readonly string[];
  /** By state, the segment the state consumes, or `null`. */
  segments: readonly (string | null)[];
  /** By state, the edges leaving it, highest priority first. */
  edges: readonly (readonly EventSchemaEdge[])[];
}>;

/**
 * A move to state `target` that consumes no segment.
 *
 * `boundary` is `0` when the edge crosses no group boundary, `g + 1` when it
 * opens group `g`, and `-(g + 1)` when it closes group `g`, where `g` indexes
 * {@link EventSchemaProgram.groups}.
 */
export type EventSchemaEdge = readonly [target: number, boundary: number];

/** A compiled element: enter at `start`, leave from `end`. */
type Fragment = readonly [start: number, end: number];

/** Whether `element` can match zero segments. */
const canMatchNothing = (element: EventSchemaElement): boolean => {
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

/** Builds the program of `schema`; `compile` documents the contract. */
function build(schema: EventSchema): EventSchemaProgram {
  const invalid = (reason: string): Error =>
    new Error(`Invalid event schema ${schema.id}: ${reason}`);

  const groups: string[] = [];
  const segments: (string | null)[] = [];
  const edges: EventSchemaEdge[][] = [];

  // Adds a state and returns its number. With a name, it is a segment state.
  const state = (segment: string | null = null): number => {
    segments.push(segment);
    edges.push([]);
    return segments.length - 1;
  };

  // Adds an edge out of `from`. Call order is priority order.
  const edge = (from: number, target: number, boundary = 0): void => {
    edges[from]?.push([target, boundary]);
  };

  // A fresh entry state, then each element's fragment chained end to start.
  const sequence = (elements: readonly EventSchemaElement[]): Fragment => {
    const start = state();
    let end = start;
    for (const element of elements) {
      const [first, last] = occurrences(element);
      edge(end, first);
      end = last;
    }
    return [start, end];
  };

  const once = (element: EventSchemaElement): Fragment => {
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
        // the boundary that opens it. Its negative closes it.
        const boundary = groups.push(element.name);
        const [first, last] = sequence(element.elements);
        const start = state();
        const end = state();
        // The body sits between two edges that carry the boundary, so a reading
        // records the group as it enters and as it leaves.
        edge(start, first, boundary);
        edge(last, end, -boundary);
        return [start, end];
      }
      case "choice": {
        if (element.alternatives.length === 0) {
          throw invalid("a choice has no alternatives");
        }
        // A choice is exactly one of its alternatives. One that can match
        // nothing makes the choice optional without saying so, and the engines
        // and the reference parser read such a schema differently. Mark the
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

  const occurrences = (element: EventSchemaElement): Fragment => {
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

  if (schema.elements.length === 0) {
    throw invalid("it has no elements");
  }
  const [start, final] = sequence(schema.elements);
  return { edges, final, groups, segments, start };
}

// Keyed by the schema object, not by its contents: two equal schemas in
// different objects compile separately, and an entry goes when its schema
// is collected.
const programs = new WeakMap<EventSchema, EventSchemaProgram>();

/**
 * Compiles `schema` into the program `runner()` runs, on first use; later
 * calls with the same schema object return the same program.
 *
 * The program prefers, in order: entering an optional element over skipping
 * it, repeating an element over leaving it, and earlier choice alternatives
 * over later ones.
 *
 * @throws {Error} When `schema` has no elements, a segment or group has no
 *   name, a group has no elements, a choice has no alternatives, or a choice
 *   alternative can match no segment.
 */
export const compile = (schema: EventSchema): EventSchemaProgram => {
  let program = programs.get(schema);
  if (!program) {
    program = build(schema);
    programs.set(schema, program);
  }
  return program;
};

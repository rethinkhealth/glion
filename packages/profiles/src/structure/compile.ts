import type {
  MessageStructure,
  StructureEdge,
  StructureElement,
  StructureProgram,
} from "./types";

type Fragment = readonly [start: number, end: number];

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

  const state = (segment: string | null = null): number => {
    segments.push(segment);
    edges.push([]);
    return segments.length - 1;
  };

  const edge = (from: number, target: number, action = 0): void => {
    edges[from]?.push([target, action]);
  };

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
        const action = groups.push(element.name);
        const [first, last] = sequence(element.elements);
        const start = state();
        const end = state();
        edge(start, first, action);
        edge(last, end, -action);
        return [start, end];
      }
      case "choice": {
        if (element.alternatives.length === 0) {
          throw invalid("a choice has no alternatives");
        }
        if (element.alternatives.some(canMatchNothing)) {
          throw invalid("a choice alternative can match no segment");
        }
        const start = state();
        const end = state();
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
    if (!(element.optional || element.repeating)) {
      return [first, last];
    }
    const start = state();
    const end = state();
    edge(start, first);
    if (element.optional) {
      edge(start, end);
    }
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

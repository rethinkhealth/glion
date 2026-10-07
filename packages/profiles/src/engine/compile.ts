// Compiles an event schema into the program runner.ts runs: a Thompson NFA over
// segment IDs, as instructions in the style of Cox's Pike VM
// (https://swtch.com/~rsc/regexp/regexp2.html).
//
//   segment  consume this segment ID, then go to `next`        (Char)
//   any      consume any segment, then go to `next`; `Hxx`     (Any)
//   z        consume any Z-segment, then go to `next`; the
//            HL7 XML schemas' `anyZSegment`
//   split    go to every target, most preferred first          (Split, Jmp)
//   open     record that a group opens, then go to `next`      (Save)
//   close    record that the innermost group closes, then go   (Save)
//   match    the message is complete                           (Match)
//
// Target order decides the grouping when a message reads more than one way:
// enter an optional element before skipping it, repeat an element before
// leaving it, take the earlier alternative of a choice. It never changes which
// messages fit.
//
// Each element compiles to a fragment [start, end], one way in and one way out,
// where `end` is a split the next fragment is joined to:
//
//   once(element)         the element, exactly one time
//   occurrences(element)  once(), wrapped for optional and repeating
//   sequence(elements)    occurrences() of each element, in order
//
// Joining fragments leaves splits with a single target, which only jump. A
// last pass points every instruction past them; they stay in the program, and
// no run reaches them.

import { invariant } from "../invariant";
import type { EventSchema, EventSchemaElement } from "./types";

/** An event schema compiled to instructions, indexed by program counter. */
export type EventSchemaProgram = Readonly<{
  /** The instructions. */
  code: readonly Instruction[];
  /** The program counter a message starts at. */
  start: number;
  /** The segment IDs the `segment` instructions consume. */
  segmentIds: ReadonlySet<string>;
}>;

/**
 * One instruction of a program, discriminated by `op`. `next` and `targets`
 * are program counters.
 */
export type Instruction =
  | Readonly<{ op: "segment"; id: string; next: number }>
  | Readonly<{ op: "any"; next: number }>
  | Readonly<{ op: "z"; next: number }>
  | Readonly<{ op: "split"; targets: readonly number[] }>
  | Readonly<{ op: "open"; id: string; name: string; next: number }>
  | Readonly<{ op: "close"; next: number }>
  | Readonly<{ op: "match" }>;

/** The segment ID that matches any segment in a schema. */
export const ANY_SEGMENT = "Hxx";

/** The segment ID that matches any Z-segment in a schema. */
export const ANY_Z_SEGMENT = "anyZSegment";

/** A compiled element: enter at `start`, leave from the split `end`. */
type Fragment = readonly [start: number, end: number];

/** An instruction while it is built, before its successors are final. */
type Draft =
  | { op: "segment"; id: string; next: number }
  | { op: "any"; next: number }
  | { op: "z"; next: number }
  | { op: "split"; targets: number[] }
  | { op: "open"; id: string; name: string; next: number }
  | { op: "close"; next: number }
  | { op: "match" };

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

/**
 * Compiles `schema` into the program `runner()` runs.
 *
 * The program prefers, in order: entering an optional element over skipping
 * it, repeating an element over leaving it, and earlier choice alternatives
 * over later ones. Neither `start` nor any instruction targets a split with a
 * single target.
 *
 * @throws {Error} When `schema` has no elements, a segment has no name, a
 *   group has no ID, no name, or no elements, a choice has no alternatives,
 *   or a choice alternative can match no segment.
 */
export function compile(schema: EventSchema): EventSchemaProgram {
  const invalid = (reason: string): Error =>
    new Error(`Invalid event schema ${schema.id}: ${reason}`);

  const code: Draft[] = [];
  const segmentIds = new Set<string>();

  // Adds an instruction and returns its program counter.
  const emit = (instruction: Draft): number => code.push(instruction) - 1;

  const split = (): number => emit({ op: "split", targets: [] });

  // The instruction that consumes the segment a schema names `id`.
  const consuming = (id: string, next: number): Draft => {
    switch (id) {
      case ANY_SEGMENT: {
        return { next, op: "any" };
      }
      case ANY_Z_SEGMENT: {
        return { next, op: "z" };
      }
      default: {
        segmentIds.add(id);
        return { id, next, op: "segment" };
      }
    }
  };

  // Adds a target to the split at `from`. Call order is priority order.
  const jump = (from: number, target: number): void => {
    const instruction = code[from];
    invariant(instruction?.op === "split", "a jump leaves a non-split");
    instruction.targets.push(target);
  };

  const sequence = (elements: readonly EventSchemaElement[]): Fragment => {
    const start = split();
    let end = start;
    for (const element of elements) {
      const [first, last] = occurrences(element);
      jump(end, first);
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
        const end = split();
        return [emit(consuming(element.name, end)), end];
      }
      case "group": {
        if (!element.id) {
          throw invalid("a group has no ID");
        }
        if (!element.name) {
          throw invalid(`group ${element.id} has no name`);
        }
        if (element.elements.length === 0) {
          throw invalid(`group ${element.id} has no elements`);
        }
        const [first, last] = sequence(element.elements);
        const end = split();
        jump(last, emit({ next: end, op: "close" }));
        const start = emit({
          id: element.id,
          name: element.name,
          next: first,
          op: "open",
        });
        return [start, end];
      }
      case "choice": {
        if (element.alternatives.length === 0) {
          throw invalid("a choice has no alternatives");
        }
        // An alternative that can match nothing makes the choice optional
        // without saying so, and a Pike VM and a backtracking parser read such
        // a schema differently. Mark the choice `optional` instead.
        if (element.alternatives.some(canMatchNothing)) {
          throw invalid("a choice alternative can match no segment");
        }
        const start = split();
        const end = split();
        for (const alternative of element.alternatives) {
          const [first, last] = occurrences(alternative);
          jump(start, first);
          jump(last, end);
        }
        return [start, end];
      }
    }
  };

  const occurrences = (element: EventSchemaElement): Fragment => {
    const [first, last] = once(element);
    if (!(element.optional || element.repeating)) {
      return [first, last];
    }
    const start = split();
    const end = split();
    // Enter before skipping.
    jump(start, first);
    if (element.optional) {
      jump(start, end);
    }
    // Repeat before leaving. A body that can match nothing makes a cycle of
    // splits, which the runner ends by visiting an instruction once per
    // segment.
    if (element.repeating) {
      jump(last, first);
    }
    jump(last, end);
    return [start, end];
  };

  if (schema.elements.length === 0) {
    throw invalid("it has no elements");
  }
  const [start, end] = sequence(schema.elements);
  jump(end, emit({ op: "match" }));
  for (const instruction of code) {
    switch (instruction.op) {
      case "split": {
        const { targets } = instruction;
        for (const [index, target] of targets.entries()) {
          targets[index] = landing(code, target);
        }
        break;
      }
      case "segment":
      case "any":
      case "z":
      case "open":
      case "close": {
        instruction.next = landing(code, instruction.next);
        break;
      }
      case "match": {
        break;
      }
    }
  }
  return { code, segmentIds, start: landing(code, start) };
}

// The program counter a chain of single-target splits from `pc` lands on.
function landing(code: readonly Draft[], pc: number): number {
  let at = pc;
  for (let hops = 0; ; hops += 1) {
    const instruction = code[at];
    if (instruction?.op !== "split" || instruction.targets.length !== 1) {
      return at;
    }
    invariant(hops < code.length, "a cycle of jumps");
    at = instruction.targets[0] ?? at;
  }
}

// Runs a message's segment IDs through its schema: validates their order and
// groups them.
//
// This is a Pike VM (Russ Cox, "Regular Expression Matching: the Virtual
// Machine Approach", https://swtch.com/~rsc/regexp/regexp2.html). compile.ts
// turns the schema into a program of instructions; the runner keeps one thread
// per reading of the message still possible, at most one per instruction, and
// steps them all over each segment. A thread records its history as a chain of
// events: segments consumed and groups opened or closed.
//
// Unlike Cox's VM, a match must cover the whole message, and a thread keeps its
// full history rather than capture slots, so every occurrence of a group is
// kept. As in RE2 and Rust's regex-automata, a schema is compiled once and its
// program reused, and addThread() walks with an explicit stack rather than
// recursion, so a schema of any size fits.
//
// A Z-segment the schema does not name may be passed over: the thread stays at
// its instruction, and nest() places the segment after the one before it.
//
// Cost: each instruction is visited at most once per segment, so a run is
// linear in the segment count times the program size.

import { invariant } from "../invariant";
import { memoize } from "../utils";
import { ANY_SEGMENT, ANY_Z_SEGMENT, compile } from "./compile";
import type { Instruction } from "./compile";
import type {
  EventSchema,
  RunnerOptions,
  RunnerResult,
  SegmentMatch,
} from "./types";

// ---------------------------------------------------------------------------
// Constants and types
// ---------------------------------------------------------------------------

// HL7v2 reserves segment IDs that start with Z for locally defined segments.
const Z_SEGMENT_PREFIX = "Z";

// One event in a thread's history, linked to the one before it.
type Event = Readonly<{ previous: Event | undefined }> &
  (
    | Readonly<{ kind: "consumed" }>
    | Readonly<{ kind: "passed-over" }>
    | Readonly<{ kind: "open"; name: string }>
    | Readonly<{ kind: "close" }>
  );

// A reading of the message so far: its program counter and its last event.
type Thread = Readonly<{ pc: number; last: Event | undefined }>;

// The state of one run.
interface Run {
  // The schema's program.
  readonly code: readonly Instruction[];
  // The threads still possible, in priority order.
  threads: Thread[];
  // How many segments have been stepped over.
  generation: number;
  // By instruction, the generation that last reached it (-1: never). Bumping
  // the generation clears every mark at once.
  readonly visited: Int32Array;
  // Threads addThread() has yet to explore, most preferred on top, as two
  // parallel stacks: a pending thread costs no object.
  readonly pendingPcs: number[];
  readonly pendingEvents: (Event | undefined)[];
}

// A schema's program, compiled on its first run and reused for the object.
const compileOnce = memoize(compile);

interface OpenGroup {
  name: string;
  children: SegmentMatch[];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Runs the segment IDs in `input` through `schema`: validates their order
 * and groups them.
 *
 * Returns `matched` with the segments grouped as the schema defines them;
 * `mismatched` with the `index` of the first segment the schema does not
 * allow at its position; or `incomplete` when every segment fits but the
 * schema requires more. `expected` lists the segment IDs valid at that
 * point, sorted.
 *
 * Where the schema admits more than one grouping, the runner prefers, in
 * order: entering an optional element over skipping it, repeating an element
 * over leaving it, and the earlier alternative of a choice. A group occurrence
 * that holds no segment is left out of the groups. A segment named `Hxx` in the
 * schema matches any segment ID, and one named `anyZSegment` any segment ID
 * that starts with `Z`.
 *
 * A Z-segment (a segment ID that starts with `Z`) that the schema does not
 * name fits at any position unless `options.allowZSegments` is `false`. It is
 * grouped right after the segment before it, in that segment's group, and
 * never makes a group occurrence that holds no other segment. A reading that
 * reaches an `Hxx` takes the Z-segment there rather than pass over it.
 *
 * Compiles `schema` on its first run and reuses the program for later runs
 * of the same object. `schema` MUST NOT change after its first run. Runs in
 * time proportional to the input length times the schema size.
 *
 * @throws {Error} When `schema` has no elements, a segment or group has no
 *   name, a group has no elements, a choice has no alternatives, or a choice
 *   alternative can match no segment.
 */
export function runner(
  schema: EventSchema,
  input: readonly string[],
  options?: RunnerOptions
): RunnerResult {
  // ----------------------------------------------------------------
  // Setup

  const { code, segmentIds, start } = compileOnce(schema);
  const allowZSegments = options?.allowZSegments ?? true;
  const run: Run = {
    code,
    generation: 0,
    pendingEvents: [],
    pendingPcs: [],
    threads: [],
    visited: new Int32Array(code.length).fill(-1),
  };

  // ----------------------------------------------------------------
  // Run

  addThread(run, start);
  for (const [index, name] of input.entries()) {
    const current = run.threads;
    run.threads = [];
    run.generation += 1;
    const passable =
      allowZSegments &&
      name.startsWith(Z_SEGMENT_PREFIX) &&
      !segmentIds.has(name);
    for (const thread of current) {
      step(run, thread, name, passable);
    }
    if (run.threads.length === 0) {
      return { expected: expected(code, current), index, type: "mismatched" };
    }
  }

  const accepted = run.threads.find(({ pc }) => code[pc]?.op === "match");
  return accepted
    ? { groups: nest(accepted.last), type: "matched" }
    : { expected: expected(code, run.threads), type: "incomplete" };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

// Moves a thread from `pc` through the instructions that consume nothing,
// and adds it at every instruction that consumes a segment, and at match.
// Depth first, most preferred target first: the first thread to reach an
// instruction wins. Cox's addthread.
function addThread(run: Run, pc: number, last?: Event): void {
  run.pendingPcs.push(pc);
  run.pendingEvents.push(last);
  for (
    let next = run.pendingPcs.pop();
    next !== undefined;
    next = run.pendingPcs.pop()
  ) {
    explore(run, next, run.pendingEvents.pop());
  }
}

// Explores from one pending thread. It goes on along the most preferred
// target itself and pushes the others, least preferred first, so the next
// one popped is the next preferred.
function explore(run: Run, from: number, fromLast: Event | undefined): void {
  let pc = from;
  let last = fromLast;
  for (;;) {
    // Already reached for this segment by a preferred thread; this also
    // ends a cycle of splits.
    if (run.visited[pc] === run.generation) {
      return;
    }
    run.visited[pc] = run.generation;
    const instruction = run.code[pc];
    invariant(instruction !== undefined, "a program counter is out of range");
    switch (instruction.op) {
      case "segment":
      case "any":
      case "z":
      case "match": {
        run.threads.push({ last, pc });
        return;
      }
      case "split": {
        const { targets } = instruction;
        for (let index = targets.length - 1; index > 0; index -= 1) {
          const target = targets[index];
          invariant(target !== undefined, "a split target is out of range");
          run.pendingPcs.push(target);
          run.pendingEvents.push(last);
        }
        const [first] = targets;
        invariant(first !== undefined, "a split has no target");
        pc = first;
        break;
      }
      case "open": {
        last = { kind: "open", name: instruction.name, previous: last };
        pc = instruction.next;
        break;
      }
      case "close": {
        last = { kind: "close", previous: last };
        pc = instruction.next;
        break;
      }
    }
  }
}

// Steps a thread over segment `name`: consumes it if its instruction can,
// then passes over it if `passable` (the thread stays where it is).
function step(
  run: Run,
  { last, pc }: Thread,
  name: string,
  passable: boolean
): void {
  const instruction = run.code[pc];
  invariant(instruction !== undefined, "a program counter is out of range");
  switch (instruction.op) {
    case "segment": {
      if (instruction.id === name) {
        addThread(run, instruction.next, { kind: "consumed", previous: last });
      }
      break;
    }
    case "any": {
      addThread(run, instruction.next, { kind: "consumed", previous: last });
      break;
    }
    case "z": {
      if (name.startsWith(Z_SEGMENT_PREFIX)) {
        addThread(run, instruction.next, { kind: "consumed", previous: last });
      }
      break;
    }
    case "match":
    case "split":
    case "open":
    case "close": {
      break;
    }
  }
  if (passable) {
    addThread(run, pc, { kind: "passed-over", previous: last });
  }
}

// The segment IDs the threads can consume next, deduplicated and sorted.
function expected(
  code: readonly Instruction[],
  from: readonly Thread[]
): string[] {
  const found = new Set<string>();
  for (const { pc } of from) {
    const instruction = code[pc];
    invariant(instruction !== undefined, "a program counter is out of range");
    switch (instruction.op) {
      case "segment": {
        found.add(instruction.id);
        break;
      }
      case "any": {
        found.add(ANY_SEGMENT);
        break;
      }
      case "z": {
        found.add(ANY_Z_SEGMENT);
        break;
      }
      case "match":
      case "split":
      case "open":
      case "close": {
        break;
      }
    }
  }
  return [...found].toSorted();
}

// ---------------------------------------------------------------------------
// Nesting
// ---------------------------------------------------------------------------

// Replays the accepted thread's events into nested groups.
function nest(last: Event | undefined): SegmentMatch[] {
  const events: Event[] = [];
  for (let event = last; event; event = event.previous) {
    events.push(event);
  }

  const root: SegmentMatch[] = [];
  const open: OpenGroup[] = [];
  let previousSiblings = root;
  let index = 0;
  for (const event of events.toReversed()) {
    switch (event.kind) {
      case "consumed": {
        previousSiblings = open.at(-1)?.children ?? root;
        previousSiblings.push(index);
        index += 1;
        break;
      }
      case "passed-over": {
        previousSiblings.push(index);
        index += 1;
        break;
      }
      case "open": {
        open.push({ children: [], name: event.name });
        break;
      }
      case "close": {
        const group = open.pop();
        invariant(group !== undefined, "an event closes a group never opened");
        if (group.children.length > 0) {
          (open.at(-1)?.children ?? root).push(group);
        }
        break;
      }
    }
  }
  return root;
}

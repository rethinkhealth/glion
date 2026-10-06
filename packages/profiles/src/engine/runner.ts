// Runs a message's segment IDs through its schema: it validates their
// order and groups them. The segment-order lint rule reads a failure; the
// group transform reads the groups.
//
// The model
//
// compile.ts turns a schema into a program (see EventSchemaProgram). A schema
// often allows more than one reading: in `MSH [{NTE}] PID`, the segment after
// MSH can be NTE or PID. The runner keeps one thread per state the reading can
// be in, and replaces that set with each segment it consumes. A thread
// carries a log of what its reading did: each segment it consumed and each
// group boundary it crossed.
//
// follow() walks from a state across the edges that consume nothing, first to
// last, and adds a thread at every state that consumes a segment, plus final.
// The first walk to reach a state keeps it, so the thread kept is the reading
// with the highest priority. The three priorities are compile.ts's.
//
// Z-segments
//
// A Z-segment the schema does not name fits anywhere when allowed. Each thread
// first consumes it if its state can (an `Hxx`), then keeps its state and
// logs Z_SEGMENT, which keeps the readings in the order backtracking tries
// them: at one point of the schema, consuming comes before passing over.
// build() places a Z_SEGMENT right after the segment before it, in that
// segment's group, whichever thread logged it.
//
// Outcomes
//
//   matched     a thread reached final after the last segment: build() replays
//               its log into the groups
//   mismatched  no thread accepted the segment at `index`; `expected` is what
//               the threads before it could consume
//   incomplete  every segment was accepted but no thread reached final;
//               `expected` is what could come next
//
// Cost
//
// `visited` and `generation` limit each segment to one visit per state and per
// edge, so a message costs its segment count times the program size. The same
// guard ends a cycle of edges that consume nothing. Logs are linked lists
// shared between threads, so a step costs one small object, not a copy.

import { compile } from "./compile";
import type {
  EventSchema,
  RunnerOptions,
  RunnerResult,
  SegmentMatch,
} from "./types";

// The segment ID that matches any segment in the schema.
const ANY_SEGMENT = "Hxx";

// HL7v2 reserves segment IDs that start with Z for locally defined segments.
const Z_SEGMENT_PREFIX = "Z";

// A step in a reading's log: SEGMENT for a consumed segment, Z_SEGMENT for a
// Z-segment the schema does not name, otherwise the boundary of the edge taken
// (see EventSchemaEdge), which never reaches Z_SEGMENT.
const SEGMENT = 0;
const Z_SEGMENT = Number.MAX_SAFE_INTEGER;

type Log = Readonly<{ step: number; previous: Log | undefined }>;
type Thread = Readonly<{ state: number; log: Log | undefined }>;
interface OpenGroup {
  name: string;
  children: SegmentMatch[];
}

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
 * schema matches any segment ID.
 *
 * A Z-segment, a segment ID that starts with `Z`, that the schema does not
 * name fits at any position unless `options.allowZSegments` is `false`. It is
 * grouped right after the segment before it, in that segment's group, and
 * never makes a group occurrence that holds no other segment. An `Hxx` takes
 * it like any other segment; at one point of the schema, taking it comes
 * before passing over it, and readings otherwise keep the priorities above.
 *
 * Runs in time proportional to the input length times the schema size.
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
  const program = compile(schema);
  const { edges, final, segments } = program;
  const allowZSegments = options?.allowZSegments ?? true;
  let named: ReadonlySet<string | null> | undefined;
  const visited = new Int32Array(segments.length).fill(-1);
  let generation = 0;
  let threads: Thread[] = [];

  const follow = (state: number, log?: Log): void => {
    if (visited[state] === generation) {
      return;
    }
    visited[state] = generation;
    if (segments[state] !== null || state === final) {
      threads.push({ log, state });
    }
    for (const [target, boundary] of edges[state] ?? []) {
      follow(target, boundary === 0 ? log : { previous: log, step: boundary });
    }
  };

  // Moves `thread` past the segment `name`: consumes it if its state can, then,
  // for a Z-segment the schema does not name, keeps its state.
  const advance = (
    { log, state }: Thread,
    name: string,
    unnamedZSegment: boolean
  ): void => {
    const consumed = segments[state];
    if (consumed === name || consumed === ANY_SEGMENT) {
      follow(state + 1, { previous: log, step: SEGMENT });
    }
    if (unnamedZSegment && visited[state] !== generation) {
      visited[state] = generation;
      threads.push({ log: { previous: log, step: Z_SEGMENT }, state });
    }
  };

  // The segment IDs the threads can consume next, deduplicated and sorted.
  const expected = (from: readonly Thread[]): string[] => {
    const found = new Set<string>();
    for (const { state } of from) {
      const name = segments[state];
      if (name) {
        found.add(name);
      }
    }
    return [...found].toSorted((a, b) => a.localeCompare(b));
  };

  follow(program.start);
  for (const [index, name] of input.entries()) {
    const current = threads;
    threads = [];
    generation += 1;
    const unnamedZSegment =
      allowZSegments &&
      name.startsWith(Z_SEGMENT_PREFIX) &&
      !(named ??= new Set(segments)).has(name);
    for (const thread of current) {
      advance(thread, name, unnamedZSegment);
    }
    if (threads.length === 0) {
      return { expected: expected(current), index, type: "mismatched" };
    }
  }

  const accepted = threads.find((thread) => thread.state === final);
  return accepted
    ? { groups: build(program.groups, accepted.log), type: "matched" }
    : { expected: expected(threads), type: "incomplete" };
}

function build(
  groups: readonly string[],
  log: Log | undefined
): SegmentMatch[] {
  const steps: number[] = [];
  for (let entry = log; entry; entry = entry.previous) {
    steps.push(entry.step);
  }

  const root: SegmentMatch[] = [];
  const open: OpenGroup[] = [];
  // Where the last segment went: a Z_SEGMENT goes right after it.
  let last = root;
  let index = 0;
  for (const step of steps.toReversed()) {
    const siblings = open.at(-1)?.children ?? root;
    if (step === SEGMENT) {
      siblings.push(index);
      last = siblings;
      index += 1;
    } else if (step === Z_SEGMENT) {
      last.push(index);
      index += 1;
    } else if (step > 0) {
      open.push({ children: [], name: groups[step - 1] as string });
    } else {
      const group = open.pop() as OpenGroup;
      const parent = open.at(-1)?.children ?? root;
      if (group.children.length > 0) {
        parent.push(group);
      }
    }
  }
  return root;
}

// Runs a message's segment IDs through its schema: it validates their
// order and groups them. The segment-order lint rule reads a failure; the
// group transform reads the groups.
//
// The model
//
// compile.ts turns a schema into a program (see program.ts). A schema
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

import { programOf } from "./compile";
import { ANY_SEGMENT } from "./constants";
import type { EventSchema, RunnerResult, SegmentMatch } from "./types";

// A step in a reading's log: SEGMENT for a consumed segment, otherwise the
// boundary of the edge taken (see EventSchemaEdge).
const SEGMENT = 0;

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
 * Runs in time proportional to the input length times the schema size.
 *
 * @throws {Error} When `schema` has no elements, a segment or group has no
 *   name, a group has no elements, a choice has no alternatives, or a choice
 *   alternative can match no segment.
 */
export function runner(
  schema: EventSchema,
  input: readonly string[]
): RunnerResult {
  const program = programOf(schema);
  const { edges, final, segments } = program;
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
    for (const { log, state } of current) {
      const consumed = segments[state];
      if (consumed === name || consumed === ANY_SEGMENT) {
        follow(state + 1, { previous: log, step: SEGMENT });
      }
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
  let index = 0;
  for (const step of steps.toReversed()) {
    const siblings = open.at(-1)?.children ?? root;
    if (step === SEGMENT) {
      siblings.push(index);
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

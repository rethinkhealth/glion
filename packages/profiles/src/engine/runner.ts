// Runs a message's segment IDs through its schema: it validates their
// order and groups them.
//
// The model
//
// compile.ts turns a schema into a program (see EventSchemaProgram). A schema
// often allows more than one reading: in `MSH [{NTE}] PID`, the segment after
// MSH can be NTE or PID. The runner keeps the readings still possible, at most
// one per state, and replaces them with each segment it consumes. A reading is
// the state it reached and its last Step; each step links to the one before
// it, so a reading's steps are the segments it consumed and the group
// boundaries it crossed.
//
// follow() walks from a state across the edges that consume nothing, first to
// last, and keeps a reading at every state that consumes a segment, plus final.
// The first walk to reach a state keeps it, so the reading kept there is the
// one with the highest priority. The three priorities are compile.ts's.
//
// Z-segments
//
// A Z-segment the schema does not name fits anywhere when allowed: each
// reading consumes it if its state can (an `Hxx`), then passes over it and
// keeps its state. Consuming before passing over keeps the readings in the
// order backtracking tries them. nest() places a segment passed over right
// after the segment before it, in that segment's group, whichever reading
// passed over it.
//
// Outcomes
//
//   matched     a reading reached final after the last segment: nest() replays
//               its steps into the groups
//   mismatched  no reading accepted the segment at `index`; `expected` is what
//               the readings before it could consume
//   incomplete  every segment was accepted but no reading reached final;
//               `expected` is what could come next
//
// Cost
//
// `visited` and `generation` limit each segment to one visit per state and per
// edge, so a message costs its segment count times the program size. The same
// guard ends a cycle of edges that consume nothing. Readings share their earlier
// steps, so a step costs one small object, not a copy.

import { compile } from "./compile";
import type {
  EventSchema,
  RunnerOptions,
  RunnerResult,
  SegmentMatch,
} from "./types";

// ---------------------------------------------------------------------------
// Constants and types
// ---------------------------------------------------------------------------

// The segment ID that matches any segment in the schema.
const ANY_SEGMENT = "Hxx";

// HL7v2 reserves segment IDs that start with Z for locally defined segments.
const Z_SEGMENT_PREFIX = "Z";

// One step of a reading, linked to the step before it.
type Step = Readonly<{ previous: Step | undefined }> &
  (
    | Readonly<{ kind: "consumed" }>
    | Readonly<{ kind: "passed-over" }>
    | Readonly<{ kind: "open"; name: string }>
    | Readonly<{ kind: "close" }>
  );

// A reading of the message so far: the state it reached, and its last step.
type Reading = Readonly<{ state: number; last: Step | undefined }>;
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
 * schema matches any segment ID.
 *
 * A Z-segment (a segment ID that starts with `Z`) that the schema does not
 * name fits at any position unless `options.allowZSegments` is `false`. It is
 * grouped right after the segment before it, in that segment's group, and
 * never makes a group occurrence that holds no other segment. A reading that
 * reaches an `Hxx` takes the Z-segment there rather than pass over it.
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
  // ----------------------------------------------------------------
  // Setup: the compiled program, and the state of this run.

  const { edges, final, groups, segments, start } = compile(schema);
  const allowZSegments = options?.allowZSegments ?? true;
  const visited = new Int32Array(segments.length).fill(-1);
  let generation = 0;
  let readings: Reading[] = [];

  // ----------------------------------------------------------------
  // Helpers: closures over that state.

  const follow = (state: number, last?: Step): void => {
    if (visited[state] === generation) {
      return;
    }
    visited[state] = generation;
    if (segments[state] !== null || state === final) {
      readings.push({ last, state });
    }
    for (const [target, boundary] of edges[state] ?? []) {
      if (boundary === 0) {
        follow(target, last);
      } else if (boundary > 0) {
        const name = groups[boundary - 1] as string;
        follow(target, { kind: "open", name, previous: last });
      } else {
        follow(target, { kind: "close", previous: last });
      }
    }
  };

  // A reading sits at a segment state or at final, neither of which has edges,
  // so follow() keeping its state adds it back and goes nowhere.
  const advance = (
    { last, state }: Reading,
    name: string,
    passable: boolean
  ) => {
    if (segments[state] === name || segments[state] === ANY_SEGMENT) {
      follow(state + 1, { kind: "consumed", previous: last });
    }
    if (passable) {
      follow(state, { kind: "passed-over", previous: last });
    }
  };

  // The segment IDs the readings can consume next, deduplicated and sorted.
  const expected = (from: readonly Reading[]): string[] => {
    const found = new Set<string>();
    for (const { state } of from) {
      const name = segments[state];
      if (name) {
        found.add(name);
      }
    }
    return [...found].toSorted();
  };

  // ----------------------------------------------------------------
  // The run: one generation per segment, then the outcome.

  follow(start);
  for (const [index, name] of input.entries()) {
    const current = readings;
    readings = [];
    generation += 1;
    const passable =
      allowZSegments &&
      name.startsWith(Z_SEGMENT_PREFIX) &&
      !segments.includes(name);
    for (const reading of current) {
      advance(reading, name, passable);
    }
    if (readings.length === 0) {
      return { expected: expected(current), index, type: "mismatched" };
    }
  }

  const accepted = readings.find((reading) => reading.state === final);
  return accepted
    ? { groups: nest(accepted.last), type: "matched" }
    : { expected: expected(readings), type: "incomplete" };
}

// ---------------------------------------------------------------------------
// Nesting
// ---------------------------------------------------------------------------

// The accepted reading's segments, nested in the groups its steps open and
// close.
function nest(last: Step | undefined): SegmentMatch[] {
  const steps: Step[] = [];
  for (let step = last; step; step = step.previous) {
    steps.push(step);
  }

  const root: SegmentMatch[] = [];
  const open: OpenGroup[] = [];
  let previousSiblings = root;
  let index = 0;
  for (const step of steps.toReversed()) {
    switch (step.kind) {
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
        open.push({ children: [], name: step.name });
        break;
      }
      case "close": {
        const group = open.pop() as OpenGroup;
        if (group.children.length > 0) {
          (open.at(-1)?.children ?? root).push(group);
        }
        break;
      }
    }
  }
  return root;
}

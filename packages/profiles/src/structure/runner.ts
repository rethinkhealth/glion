// Checks a message's segment order against its structure, one segment at a
// time. @glion/lint-profile-events-segments-order feeds it each segment name,
// then reads `accepted` to see whether the message was complete.
//
// The model
//
// A structure often allows more than one reading. In `MSH [{NTE}] PID`, the
// segment after MSH can be NTE or PID, and the segment after an NTE can be
// another NTE or PID. The runner keeps every position the structure could be
// in as a set of states, `live`, and replaces that set with each segment it
// consumes. A segment is valid when at least one position accepts it. The
// message is complete when `final` is one of the positions.
//
// `live` holds only states that consume a segment, plus `final`. follow()
// walks past the states that consume nothing.
//
// Example
//
// `MSH [{NTE}] PID` compiles to these states. compile.ts explains the layout;
// a segment state moves to the next state number without an edge.
//
//   0 -> 1        1 MSH       2 -> 5        3 NTE
//   4 -> 3, 6     5 -> 3, 6   6 -> 7        7 PID     8 final
//
//   live {1}      expected [MSH]
//   consume MSH   follow(2) reaches 3 and 7
//   live {3,7}    expected [NTE, PID]
//   consume NTE   follow(4) reaches 3 and 7
//   live {3,7}    expected [NTE, PID]
//   consume PID   follow(8)
//   live {8}      expected [], accepted
//
// Cost
//
// `visited` and `generation` limit each consume() to one visit per state and
// per edge, so a segment costs the size of the program, and a message costs
// that times its segment count. `generation` is a counter rather than an array
// to clear, which keeps the per-segment reset at one assignment.
//
// The same guard ends cycles. A repeating element whose body matches nothing
// forms a loop of edges that consume nothing, and the second visit to a state
// in that loop returns.
//
// Scope
//
// The runner reports whether a reading exists, not which reading it is. It
// ignores edge priority and records no group boundaries, so `live` is a list
// of state numbers. matchStructure() answers the second question and carries
// one thread per reading.

import { programOf } from "./compile";
import { ANY_SEGMENT } from "./constants";
import type { MessageStructure, Runner, RunnerEvent } from "./types";

/**
 * Creates a runner that validates segment order against `structure`, one
 * segment at a time.
 *
 * A runner is single-use: create one per message. After the first `invalid`
 * event every later `consume()` returns `invalid` with an empty `expected`.
 * `expected` lists segment names in sorted order; `Hxx` stands for any
 * segment.
 *
 * @throws {Error} When `structure` is invalid: see {@link matchStructure}.
 */
export function runner(structure: MessageStructure): Runner {
  const program = programOf(structure);
  const { edges, final, segments } = program;

  // `visited[state]` is the generation that last reached `state`. One
  // generation is one call to consume(). -1 means no call has reached it.
  const visited = new Int32Array(segments.length).fill(-1);
  let generation = 0;

  // The positions the structure could be in after the segments so far. Each
  // entry consumes a segment next, or is `final`.
  let live: number[] = [];

  // Set by the first rejected segment. After that, `live` holds the positions
  // from before that segment, so the caller can still read `expected`.
  let failed = false;

  // Walks from `state` across the edges that consume nothing and adds to
  // `live` the states it reaches that consume a segment, plus `final`. The NFA
  // term is the epsilon closure. It gives the segments the message can carry
  // next from this point in the structure.
  const follow = (state: number): void => {
    // Another route reached this state in this generation. Its closure is in
    // `live`; walking it again would repeat the work or spin on a cycle.
    if (visited[state] === generation) {
      return;
    }
    visited[state] = generation;

    // The walk stops here: the state consumes a segment, or ends the message.
    if (segments[state] !== null || state === final) {
      live.push(state);
    }

    // Keep walking. Edge order sets priority for matchStructure(). The runner
    // follows every edge, so the order changes nothing here.
    for (const [target] of edges[state] ?? []) {
      follow(target);
    }
  };

  // The segment names `states` can consume, deduplicated and sorted, for the
  // `expected` list in a report. `final` adds nothing. `Hxx` is listed as Hxx.
  const names = (states: readonly number[]): string[] => {
    const found = new Set<string>();
    for (const state of states) {
      const name = segments[state];
      if (name) {
        found.add(name);
      }
    }
    return [...found].toSorted((a, b) => a.localeCompare(b));
  };

  // Before the first segment: what the message can open with.
  follow(program.start);

  const consume = (symbol: string): RunnerEvent => {
    // A segment was already rejected, so the positions are stale.
    if (failed) {
      return { expected: [], symbol, type: "invalid" };
    }

    // Start a new set, and raise the generation to clear `visited`.
    const current = live;
    live = [];
    generation += 1;

    // Advance the positions that accept this segment. `state + 1` is the state
    // after consuming it, because the compiler puts a segment's exit state
    // next in the numbering. See compile.ts.
    for (const state of current) {
      const name = segments[state];
      if (name === symbol || name === ANY_SEGMENT) {
        follow(state + 1);
      }
    }

    // No position accepted the segment, so it cannot appear here. Restore the
    // previous positions for the `expected` list in the report.
    if (live.length === 0) {
      failed = true;
      live = current;
      return { expected: names(current), symbol, type: "invalid" };
    }

    return { type: "step" };
  };

  return {
    // Complete when one surviving position is the end of the structure. Others
    // can survive with it: after `MSH NTE` in `MSH [{NTE}]`, `accepted` is
    // true and `expected` is `[NTE]`, because the message can end there or
    // carry another note.
    get accepted() {
      return !failed && live.includes(final);
    },
    consume,
    get expected() {
      return names(live);
    },
  };
}

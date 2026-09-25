// Validates a message's segment order against its structure, one segment at a
// time. `@glion/lint-profile-events-segments-order` drives it: feed it each
// segment name, ask afterwards whether the message was complete.
//
// The idea
// --------
// A structure rarely pins down one reading. After `MSH` in `MSH [{NTE}] PID`,
// the message may continue with an `NTE` or go straight to `PID`; after an
// `NTE`, another `NTE` or `PID`. A backtracking parser would guess and undo.
// This runner never guesses: it holds *every* position the structure could be
// in at once, and narrows that set with each segment. A segment is valid when
// at least one position accepts it; the message is complete when one of the
// surviving positions is the end.
//
// That set is `live`, and it holds only states that consume a segment (plus
// `final`). A state that consumes nothing is never a resting place: `follow()`
// walks past it to the states that do.
//
// A worked example
// ----------------
// `MSH [{NTE}] PID` compiles to (see compile.ts for the layout; `->` is an
// edge, and a segment state moves to the next state number implicitly):
//
//   0 -> 1        1 MSH       2 -> 5        3 NTE
//   4 -> 3, 6     5 -> 3, 6   6 -> 7        7 PID     8 final
//
//   live {1}       expected [MSH]        from follow(0): past 0 to MSH
//   consume MSH -> follow(2): 2 -> 5 -> 3 and 6 -> 7
//   live {3,7}     expected [NTE, PID]   both continuations, held together
//   consume NTE -> follow(4): 4 -> 3 (again) and 6 -> 7
//   live {3,7}     expected [NTE, PID]   the repeat and the way out
//   consume PID -> follow(8)
//   live {8}       expected []           accepted: 8 is final
//
// Nothing above is a guess that might be revisited. `live` is every reading,
// carried forward together.
//
// Cost
// ----
// `visited` and `generation` make each state and each edge visited at most
// once per segment, so a segment costs at most the size of the program and a
// message costs that times its segment count. `generation` is a stamp rather
// than a cleared array: bumping one integer resets the marks in O(1), which
// matters because the reset happens per segment.
//
// The guard is also what makes cycles safe. A repeating element whose body can
// match nothing is a loop of edges that consume nothing; `follow()` recurses
// into it and the stamp stops it on the second visit.
//
// What this runner does not do
// ----------------------------
// It answers "is any reading possible?", not "which reading is it". It never
// looks at edge priorities and never records group boundaries, which is why
// `live` can be a plain list of state numbers. `matchStructure()` answers the
// other question, and pays for it: a thread per reading, each carrying its
// group actions.

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

  // `visited[state]` is the generation that last reached `state`. A generation
  // is one call to consume(); -1 is "never reached".
  const visited = new Int32Array(segments.length).fill(-1);
  let generation = 0;

  // Every position the structure could be in, after the segments so far. Each
  // entry either consumes a segment next or is `final`.
  let live: number[] = [];

  // Latched by the first rejected segment. From then on `live` holds the
  // positions from *before* that segment, kept only so the caller can still
  // read what had been expected.
  let failed = false;

  // Walks from `state` across every edge that consumes nothing, and collects
  // into `live` the states reached that do consume a segment (or are `final`).
  // The NFA term is the epsilon closure; here it answers "having arrived at
  // this point in the structure, what could the message say next?".
  const follow = (state: number): void => {
    // Reached already in this generation, by another route. Its closure is
    // in `live` and re-walking it would repeat work, or spin on a cycle.
    if (visited[state] === generation) {
      return;
    }
    visited[state] = generation;

    // A resting place: it consumes a segment, or it is the end of the message.
    if (segments[state] !== null || state === final) {
      live.push(state);
    }

    // Otherwise keep walking. Edge order carries priority for matchStructure();
    // here every edge is followed, so the order makes no difference.
    for (const [target] of edges[state] ?? []) {
      follow(target);
    }
  };

  // The segment names `states` can consume, deduplicated and sorted, for the
  // `expected` list in a report. `final` contributes nothing, and `Hxx` is
  // listed as itself.
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

  // Before any segment: everything the message could open with.
  follow(program.start);

  const consume = (symbol: string): RunnerEvent => {
    // Already failed. The positions are stale, so there is nothing to expect.
    if (failed) {
      return { expected: [], symbol, type: "invalid" };
    }

    // Swap in a fresh set and bump the generation, which clears `visited`.
    const current = live;
    live = [];
    generation += 1;

    // Advance every position that accepts this segment. `state + 1` is the
    // state after consuming it: the compiler lays a segment's exit state
    // immediately after it, so the move needs no edge (see compile.ts).
    for (const state of current) {
      const name = segments[state];
      if (name === symbol || name === ANY_SEGMENT) {
        follow(state + 1);
      }
    }

    // No position accepted it: the segment cannot appear here. Restore the
    // previous positions so the report can say what was expected instead.
    if (live.length === 0) {
      failed = true;
      live = current;
      return { expected: names(current), symbol, type: "invalid" };
    }

    return { type: "step" };
  };

  return {
    // Complete when one surviving position is the end of the structure. Other
    // positions may survive alongside it: after `MSH NTE` in `MSH [{NTE}]`,
    // `accepted` is true and `expected` is still `[NTE]`, because the message
    // may end there or carry another note.
    get accepted() {
      return !failed && live.includes(final);
    },
    consume,
    get expected() {
      return names(live);
    },
  };
}

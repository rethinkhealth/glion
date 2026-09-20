import type { Runner, RunnerEvent, StructureProgram } from "./types";

const ANY_SEGMENT = "Hxx";

/**
 * Creates a runner that validates segment order against `program`, one
 * segment at a time.
 *
 * A runner is single-use: create one per message. After the first `invalid`
 * event every later `consume()` returns `invalid` with an empty `expected`.
 * `expected` lists segment names in sorted order; `Hxx` stands for any
 * segment.
 */
export function runner(program: StructureProgram): Runner {
  const { edges, final, segments } = program;
  const visited = new Int32Array(segments.length).fill(-1);
  let generation = 0;
  let live: number[] = [];
  let failed = false;

  const follow = (state: number): void => {
    if (visited[state] === generation) {
      return;
    }
    visited[state] = generation;
    if (segments[state] !== null || state === final) {
      live.push(state);
    }
    for (const [target] of edges[state] ?? []) {
      follow(target);
    }
  };

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

  follow(program.start);

  const consume = (symbol: string): RunnerEvent => {
    if (failed) {
      return { expected: [], symbol, type: "invalid" };
    }
    const current = live;
    live = [];
    generation += 1;
    for (const state of current) {
      const name = segments[state];
      if (name === symbol || name === ANY_SEGMENT) {
        follow(state + 1);
      }
    }
    if (live.length === 0) {
      failed = true;
      live = current;
      return { expected: names(current), symbol, type: "invalid" };
    }
    return { type: "step" };
  };

  return {
    get accepted() {
      return !failed && live.includes(final);
    },
    consume,
    get expected() {
      return names(live);
    },
  };
}

import { programOf } from "./compile";
import { ANY_SEGMENT } from "./constants";
import type { MessageStructure, StructureMatch } from "./types";

const SEGMENT = 0;

type Log = Readonly<{ action: number; previous: Log | undefined }>;
type Thread = Readonly<{ state: number; log: Log | undefined }>;
interface OpenGroup {
  name: string;
  children: StructureMatch[];
}

/**
 * Matches the segment names in `input` against `structure` and returns the
 * segments grouped as the structure defines them, or `undefined` when `input`
 * does not fit it.
 *
 * Where the structure admits more than one grouping, the match prefers, in
 * order: entering an optional element over skipping it, repeating an element
 * over leaving it, and the earlier alternative of a choice. A group occurrence
 * that holds no segment is left out of the match. A segment named `Hxx` in the
 * structure matches any segment name.
 *
 * Runs in time proportional to the input length times the structure size.
 *
 * @throws {Error} When `structure` has no elements, a segment or group has no
 *   name, a group has no elements, a choice has no alternatives, or a choice
 *   alternative can match no segment.
 */
export function matchStructure(
  structure: MessageStructure,
  input: readonly string[]
): readonly StructureMatch[] | undefined {
  const program = programOf(structure);
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
    for (const [target, action] of edges[state] ?? []) {
      follow(target, action === 0 ? log : { action, previous: log });
    }
  };

  follow(program.start);
  for (const name of input) {
    const current = threads;
    threads = [];
    generation += 1;
    for (const { log, state } of current) {
      const consumed = segments[state];
      if (consumed === name || consumed === ANY_SEGMENT) {
        follow(state + 1, { action: SEGMENT, previous: log });
      }
    }
    if (threads.length === 0) {
      return undefined;
    }
  }

  const accepted = threads.find((thread) => thread.state === final);
  return accepted && build(program.groups, accepted.log);
}

function build(
  groups: readonly string[],
  log: Log | undefined
): StructureMatch[] {
  const actions: number[] = [];
  for (let entry = log; entry; entry = entry.previous) {
    actions.push(entry.action);
  }

  const root: StructureMatch[] = [];
  const open: OpenGroup[] = [];
  let index = 0;
  for (const action of actions.toReversed()) {
    const siblings = open.at(-1)?.children ?? root;
    if (action === SEGMENT) {
      siblings.push(index);
      index += 1;
    } else if (action > 0) {
      open.push({ children: [], name: groups[action - 1] as string });
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

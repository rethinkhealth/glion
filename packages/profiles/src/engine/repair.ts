// Reads a message's segment IDs as the nearest message its schema accepts:
// the one with the fewest missing or unexpected segments (ADR 0025).
//
// This is minimum-distance error correction for a regular language (Wagner,
// "Order-n correction for regular languages", CACM 17(5), 1974) over the
// program compile.ts builds: a shortest path over states (instruction,
// position in the message). split, open, and close cost nothing; consuming a
// segment that matches, or passing over a Z-segment, costs nothing; moving
// past a segment instruction without input, a missing segment, costs one
// edit; consuming a segment without moving, an unexpected segment, costs one
// edit and one unexpected. Costs compare as (edits, unexpected).
//
// Two passes. The first, from the end of the message back to its start,
// computes each state's cost to go: the cost of the cheapest path from it to
// match after the last segment. The second walks forward from the start,
// depth first, trying each state's moves in the runner's priority order and
// following only those that keep to a cheapest path, with a state never
// visited twice, as the runner's addThread() does. Of the cheapest repairs it
// therefore returns the first in that order.
//
// Cost: each pass handles each state once, so a repair is linear in the
// segment count times the program size.

import { invariant } from "../invariant";
import { memoize } from "../utils";
import {
  ANY_SEGMENT,
  ANY_Z_SEGMENT,
  Z_SEGMENT_PREFIX,
  compileOnce,
} from "./compile";
import type { EventSchemaProgram, Instruction } from "./compile";
import type { EventSchema, RepairEdit, RunnerOptions } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// One event in a reading's history, linked to the one before it.
type Event = Readonly<{ previous: Event | undefined }> &
  (
    | Readonly<{ kind: "consumed" }>
    | Readonly<{ kind: "passed-over" }>
    | Readonly<{ kind: "unexpected" }>
    | Readonly<{ kind: "missing"; id: string }>
    | Readonly<{ kind: "open"; id: string }>
    | Readonly<{ kind: "close" }>
  );

// The state of one repair.
interface Search {
  // The schema's program.
  readonly code: readonly Instruction[];
  // The message's segment IDs.
  readonly input: readonly string[];
  // By position, whether the segment there may be passed over: a Z-segment
  // the schema does not name, while Z-segments are allowed.
  readonly passable: readonly boolean[];
  // The cost of a missing segment. Unexpected segments never outnumber the
  // input's, so (edits, unexpected) compares as edits * stride + unexpected.
  readonly stride: number;
  // By state (position * code.length + pc), its cost to go.
  readonly toGo: Float64Array;
  // By instruction, the last position at which its cost to go settled (-1:
  // none).
  readonly settled: Int32Array;
}

// A move from one state to another, what it costs, and the last event it
// records, linked to the move's earlier events, if any.
type Move = Readonly<{ pc: number; at: number; cost: number; event?: Event }>;

// A state the forward walk has reached, and the last event on its way there.
type Visit = Readonly<{ pc: number; at: number; last: Event | undefined }>;

// By instruction, the instructions that reach it without reading a segment,
// and how many missing segments that takes: none through split, open, and
// close, and one from a segment instruction.
type Predecessors = readonly (readonly (readonly [
  pc: number,
  missing: number,
])[])[];

// The states of one position still to settle, by program counter, in order
// of cost.
type SettleQueue = Readonly<{
  // The next state to settle, or `undefined` when none is left.
  next: () => number | undefined;
  // Queues a state reached through a missing segment at `cost`. Costs MUST
  // arrive in order.
  reach: (pc: number, cost: number) => void;
}>;

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

/**
 * Reads the segment IDs in `input` as the message `schema` accepts with the
 * fewest edits: segments missing from `input`, and segments `input` has that
 * the schema does not allow there.
 *
 * Returns the edits in input order; none when `input` fits `schema`, as
 * `runner()` matches it. Of repairs with as many edits, it returns one with
 * the fewest unexpected segments; of those, the first in `runner()`'s
 * priority order, where at each segment the schema's reading comes first,
 * then passing over a Z-segment, then the segment as unexpected in place of
 * the schema's segment there, as missing, then a missing segment, then an
 * unexpected one.
 *
 * A Z-segment the schema does not name costs no edit unless
 * `options.allowZSegments` is `false`.
 *
 * Compiles `schema` on its first use by `runner()` or `repair()` and reuses
 * the program. `schema` MUST NOT change after its first use. Runs in time and
 * space proportional to the input length times the schema size.
 *
 * @throws {Error} As `runner()`, for an invalid `schema`.
 */
export function repair(
  schema: EventSchema,
  input: readonly string[],
  options?: RunnerOptions
): RepairEdit[] {
  const program = compileOnce(schema);
  const { code, segmentIds } = program;
  const allowZSegments = options?.allowZSegments ?? true;
  const search: Search = {
    code,
    input,
    passable: input.map(
      (name) =>
        allowZSegments &&
        name.startsWith(Z_SEGMENT_PREFIX) &&
        !segmentIds.has(name)
    ),
    settled: new Int32Array(code.length).fill(-1),
    stride: input.length + 1,
    toGo: new Float64Array((input.length + 1) * code.length).fill(Infinity),
  };

  costsToGo(search, predecessorsOnce(program));
  return edits(cheapest(search, program.start), input);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

// The moves out of state (`pc`, `at`), in the runner's priority order.
function moves(search: Search, pc: number, at: number): Move[] {
  const instruction = search.code[pc];
  invariant(instruction !== undefined, "a program counter is out of range");
  switch (instruction.op) {
    case "split": {
      return instruction.targets.map((target) => ({ at, cost: 0, pc: target }));
    }
    case "open": {
      const { id, next } = instruction;
      return [
        {
          at,
          cost: 0,
          event: { id, kind: "open", previous: undefined },
          pc: next,
        },
      ];
    }
    case "close": {
      return [
        {
          at,
          cost: 0,
          event: { kind: "close", previous: undefined },
          pc: instruction.next,
        },
      ];
    }
    case "segment":
    case "any":
    case "z": {
      return [
        ...reading(search, pc, at),
        ...displacing(search, instruction, at),
        {
          at,
          cost: search.stride,
          event: {
            id: missingId(instruction),
            kind: "missing",
            previous: undefined,
          },
          pc: instruction.next,
        },
        ...unexpected(search, pc, at),
      ];
    }
    case "match": {
      return [...reading(search, pc, at), ...unexpected(search, pc, at)];
    }
  }
}

// The zero-cost moves that read the segment at `at`: consuming it, then
// passing over it.
function reading(search: Search, pc: number, at: number): Move[] {
  const name = search.input[at];
  if (name === undefined) {
    return [];
  }
  const found: Move[] = [];
  const target = consumer(search.code, pc, name);
  if (target !== undefined) {
    found.push({
      at: at + 1,
      cost: 0,
      event: { kind: "consumed", previous: undefined },
      pc: target,
    });
  }
  if (search.passable[at]) {
    found.push({
      at: at + 1,
      cost: 0,
      event: { kind: "passed-over", previous: undefined },
      pc,
    });
  }
  return found;
}

// The move that reads the segment at `at` as unexpected in place of the
// segment `instruction` stands for, taken as missing, if there is one: an
// edit-distance substitution, as its two edits.
function displacing(
  search: Search,
  instruction: Extract<Instruction, { op: "segment" | "any" | "z" }>,
  at: number
): Move[] {
  if (at >= search.input.length) {
    return [];
  }
  const missing: Event = {
    id: missingId(instruction),
    kind: "missing",
    previous: undefined,
  };
  return [
    {
      at: at + 1,
      cost: 2 * search.stride + 1,
      event: { kind: "unexpected", previous: missing },
      pc: instruction.next,
    },
  ];
}

// The move that reads the segment at `at` as unexpected, if there is one.
function unexpected(search: Search, pc: number, at: number): Move[] {
  return at < search.input.length
    ? [
        {
          at: at + 1,
          cost: search.stride + 1,
          event: { kind: "unexpected", previous: undefined },
          pc,
        },
      ]
    : [];
}

// Where the instruction at `pc` goes after consuming segment `name`, or
// `undefined` when it cannot consume it.
function consumer(
  code: readonly Instruction[],
  pc: number,
  name: string
): number | undefined {
  const instruction = code[pc];
  invariant(instruction !== undefined, "a program counter is out of range");
  switch (instruction.op) {
    case "segment": {
      return instruction.id === name ? instruction.next : undefined;
    }
    case "any": {
      return instruction.next;
    }
    case "z": {
      return name.startsWith(Z_SEGMENT_PREFIX) ? instruction.next : undefined;
    }
    case "match":
    case "split":
    case "open":
    case "close": {
      return undefined;
    }
  }
}

// The segment ID a missing segment instruction stands for, as the schema
// names it.
function missingId(
  instruction: Extract<Instruction, { op: "segment" | "any" | "z" }>
): string {
  switch (instruction.op) {
    case "segment": {
      return instruction.id;
    }
    case "any": {
      return ANY_SEGMENT;
    }
    case "z": {
      return ANY_Z_SEGMENT;
    }
  }
}

// ---------------------------------------------------------------------------
// Costs to go
// ---------------------------------------------------------------------------

// The moves within a position, reversed, for each program.
const predecessorsOnce = memoize(
  ({ code }: EventSchemaProgram): Predecessors => {
    const found: [number, number][][] = code.map(() => []);
    for (const [pc, instruction] of code.entries()) {
      switch (instruction.op) {
        case "split": {
          for (const target of instruction.targets) {
            found[target]?.push([pc, 0]);
          }
          break;
        }
        case "open":
        case "close": {
          found[instruction.next]?.push([pc, 0]);
          break;
        }
        case "segment":
        case "any":
        case "z": {
          found[instruction.next]?.push([pc, 1]);
          break;
        }
        case "match": {
          break;
        }
      }
    }
    return found;
  }
);

// Fills `search.toGo`, from the last position back to the first.
function costsToGo(search: Search, predecessors: Predecessors): void {
  for (let at = search.input.length; at >= 0; at -= 1) {
    costsAt(search, predecessors, at);
  }
}

// Fills the costs to go at position `at`: each state starts from the moves
// that read the segment at `at`, or from match at the end, then costs spread
// back along the moves within the position, cheapest first.
function costsAt(search: Search, predecessors: Predecessors, at: number): void {
  const queue = settleQueue(search, at, startingStates(search, at));
  for (let pc = queue.next(); pc !== undefined; pc = queue.next()) {
    // A state queued more than once settles at its lowest cost, first.
    if (search.settled[pc] !== at) {
      spread(search, predecessors, at, pc, queue);
    }
  }
}

// Sets the starting cost to go of each state at position `at` that has one,
// and returns those states sorted by it.
function startingStates(search: Search, at: number): number[] {
  const { code, toGo } = search;
  const base = at * code.length;
  const found: number[] = [];
  for (const pc of code.keys()) {
    const cost = leaving(search, pc, at);
    if (cost < Infinity) {
      toGo[base + pc] = cost;
      found.push(pc);
    }
  }
  return found.toSorted(
    (a, b) => (toGo[base + a] ?? 0) - (toGo[base + b] ?? 0)
  );
}

// The starting states, sorted, merged with those reached through a missing
// segment. The moves within a position cost nothing or one missing segment,
// and states settle in order of cost, so the reached ones arrive in order.
function settleQueue(
  search: Search,
  at: number,
  starts: readonly number[]
): SettleQueue {
  const base = at * search.code.length;
  const reachedPcs: number[] = [];
  const reachedCosts: number[] = [];
  let nextStart = 0;
  let nextReached = 0;
  return {
    next: () => {
      const start = starts[nextStart];
      const startCost =
        start === undefined
          ? Infinity
          : (search.toGo[base + start] ?? Infinity);
      if (
        start !== undefined &&
        startCost <= (reachedCosts[nextReached] ?? Infinity)
      ) {
        nextStart += 1;
        return start;
      }
      const later = reachedPcs[nextReached];
      nextReached += 1;
      return later;
    },
    reach: (pc, cost) => {
      reachedPcs.push(pc);
      reachedCosts.push(cost);
    },
  };
}

// Settles state `pc` at position `at` and every state that reaches it there
// at no cost, lowering their costs to go; queues those that reach it through
// a missing segment.
function spread(
  search: Search,
  predecessors: Predecessors,
  at: number,
  pc: number,
  queue: SettleQueue
): void {
  const { code, settled, stride, toGo } = search;
  const base = at * code.length;
  const cost = toGo[base + pc] ?? Infinity;
  const pending = [pc];
  for (let to = pending.pop(); to !== undefined; to = pending.pop()) {
    settled[to] = at;
    for (const [from, missing] of predecessors[to] ?? []) {
      const through = cost + missing * stride;
      if (through < (toGo[base + from] ?? Infinity)) {
        toGo[base + from] = through;
        if (missing === 0) {
          pending.push(from);
        } else {
          queue.reach(from, through);
        }
      }
    }
  }
}

// The cheapest way from state (`pc`, `at`) to match that starts by reading
// the segment at `at`, or that is match at the end. Mirrors reading() and
// unexpected(), without their allocations.
function leaving(search: Search, pc: number, at: number): number {
  const { code, input, passable, stride, toGo } = search;
  const instruction = code[pc];
  invariant(instruction !== undefined, "a program counter is out of range");
  switch (instruction.op) {
    case "split":
    case "open":
    case "close": {
      return Infinity;
    }
    case "match": {
      if (at === input.length) {
        return 0;
      }
      break;
    }
    case "segment":
    case "any":
    case "z": {
      break;
    }
  }
  const name = input[at];
  if (name === undefined) {
    return Infinity;
  }
  const next = (at + 1) * code.length;
  const stay = toGo[next + pc] ?? Infinity;
  let best = stay + stride + 1;
  if (passable[at]) {
    best = Math.min(best, stay);
  }
  const target = consumer(code, pc, name);
  if (target !== undefined) {
    best = Math.min(best, toGo[next + target] ?? Infinity);
  }
  return best;
}

function costOf(search: Search, pc: number, at: number): number {
  return search.toGo[at * search.code.length + pc] ?? Infinity;
}

// ---------------------------------------------------------------------------
// The cheapest path
// ---------------------------------------------------------------------------

// Walks from `start` at the first position to match after the last, depth
// first, along the moves that keep to a cheapest path, most preferred first.
// Returns the last event of the first path that arrives.
function cheapest(search: Search, start: number): Event | undefined {
  const { code, input } = search;
  const visited = new Uint8Array(search.toGo.length);
  const pending: Visit[] = [{ at: 0, last: undefined, pc: start }];
  for (let visit = pending.pop(); visit; visit = pending.pop()) {
    const { at, last, pc } = visit;
    const state = at * code.length + pc;
    if (visited[state] === 0) {
      visited[state] = 1;
      if (at === input.length && code[pc]?.op === "match") {
        return last;
      }
      pending.push(...onCheapestPath(search, visit).toReversed());
    }
  }
  invariant(false, "no path reaches the end of the schema");
}

// The states `visit` moves to that keep to a cheapest path, in the runner's
// priority order.
function onCheapestPath(search: Search, { at, last, pc }: Visit): Visit[] {
  const cost = costOf(search, pc, at);
  return moves(search, pc, at)
    .filter((move) => move.cost + costOf(search, move.pc, move.at) === cost)
    .map((move) => ({
      at: move.at,
      last: move.event ? after(move.event, last) : last,
      pc: move.pc,
    }));
}

// `event` and the events before it in its move, linked after `last`.
function after(event: Event, last: Event | undefined): Event {
  return {
    ...event,
    previous: event.previous ? after(event.previous, last) : last,
  };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

// The events that end in `last`, first to last.
function replay(last: Event | undefined): Event[] {
  const events: Event[] = [];
  for (let event = last; event; event = event.previous) {
    events.push(event);
  }
  return events.toReversed();
}

// The edits in the history that ends in `last`, each with the IDs of the
// groups it sits in.
function edits(
  last: Event | undefined,
  input: readonly string[]
): RepairEdit[] {
  const found: RepairEdit[] = [];
  const open: string[] = [];
  // The groups of the last segment consumed, which an unexpected segment
  // after it is read in.
  let previousPath: readonly string[] = [];
  let index = 0;
  for (const event of replay(last)) {
    switch (event.kind) {
      case "consumed": {
        previousPath = [...open];
        index += 1;
        break;
      }
      case "passed-over": {
        index += 1;
        break;
      }
      case "unexpected": {
        const segment = input[index];
        invariant(
          segment !== undefined,
          "an unexpected segment is past the input"
        );
        found.push({ index, path: previousPath, segment, type: "unexpected" });
        index += 1;
        break;
      }
      case "missing": {
        found.push({
          index,
          path: [...open],
          segment: event.id,
          type: "missing",
        });
        break;
      }
      case "open": {
        open.push(event.id);
        break;
      }
      case "close": {
        open.pop();
        break;
      }
    }
  }
  return found;
}

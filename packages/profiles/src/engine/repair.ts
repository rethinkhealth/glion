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
//
// ===========================================================================
// GUIDE
// ===========================================================================
//
// Reading order: sections 1 to 4 define the problem and its terms; section 6
// works one example through both passes; then read the code top to bottom.
// Each block of code starts with a "Note:" saying where it fits.
//
// 1. The problem
//
//    Input: the program P that compile.ts builds from an event schema (a
//    Thompson NFA written as instructions, one per program counter `pc`), and
//    the message's segment IDs w = input[0] … input[n-1].
//    Output: the edits that turn w into the closest message P accepts.
//
//    An edit is one of two kinds:
//      missing     the schema requires a segment the message does not have
//                  (an insertion into w)
//      unexpected  the message has a segment the schema does not allow there
//                  (a deletion from w)
//    "Closest" means fewest edits in total; section 3 says how ties break.
//
//    There is no third kind, substitution. A segment ID names a structure,
//    not a string with a typo, so a segment where another belongs is a
//    different segment: two edits, one missing and one unexpected. Counting
//    it as one edit would let a valid segment pass for a missing one: against
//    `MSH PID PV1 [PV2]`, the message `MSH PID PV2` would tie between "PV1
//    missing" and "PV2 in place of PV1", though PV2 is valid where it is (the
//    test "reports a required segment as missing, not as displaced" pins
//    this). The two kinds also map onto a vfile message's fields: missing
//    sets `expected`, unexpected sets `actual`.
//
// 2. Vocabulary
//
//    position `at`   how many segments of w have been read, 0 … n. Segment
//                    input[at] is the next one to read.
//    state           a pair (pc, at): "the program is at instruction pc and
//                    `at` segments are read". There are (n + 1) × |P| states.
//    column          all states with the same `at`.
//    move            an edge between two states, with a cost (section 3).
//                    Every move either stays in its column or goes one column
//                    right; none goes left. That is what makes pass 1
//                    possible.
//    cost to go      toGo(pc, at): the cost of the cheapest sequence of moves
//                    from (pc, at) to (match, n), that is, of the cheapest
//                    way to finish: the schema satisfied and the whole
//                    message read. Infinity when no finish is reachable.
//                    It is defined by the Bellman equation:
//                      toGo(match, n) = (0, 0)
//                      toGo(s) = min over moves m out of s of
//                                cost(m) + toGo(target of m)
//                    Pass 1 writes it for every state; pass 2 only reads
//                    it. toGo(start, 0) is the cost of the whole repair.
//                    Stored in Search.toGo, a flat Float64Array with one
//                    column per position: toGo(pc, at) is
//                    toGo[at * code.length + pc], each pair packed into one
//                    number (section 3). In the visualizer, the number in
//                    each cell is toGo of that cell.
//    tight move      a move m out of state s with
//                      cost(m) + toGo(target of m) === toGo(s).
//                    A path is a cheapest path exactly when every move on it
//                    is tight. Pass 2 follows tight moves only.
//
// 3. Costs
//
//    A cost is a pair of counts:
//
//      (edits, unexpected)
//        edits       every edit, of either kind: missing + unexpected
//        unexpected  how many of those edits are unexpected
//
//    "Edits" is not a third kind of edit; it is the total. Pairs compare
//    edits first, and unexpected only when the totals are equal:
//
//      move         edits  unexpected
//      missing        1        0
//      unexpected     1        1
//
//    So both kinds count as one edit, and an unexpected segment also counts
//    in the tie-breaker. It costs a little more than a missing segment, never
//    as much as a whole extra edit. In ORU_R01, `MSH PID OBR OBX ORC OBX` can
//    be repaired as "OBR missing" (1, 0) or "ORC unexpected" (1, 1): one edit
//    either way, and the tie-breaker picks the reading that keeps every
//    segment the sender wrote. An unexpected segment throws away something
//    the sender sent; a missing one only asks for more.
//
//    The first count must be the total, not the missing count. Compared as
//    (missing, unexpected), a repair with no missing segment and five
//    unexpected ones would beat a repair with one missing segment and nothing
//    else.
//
//    How the pair is stored: as one number in base `stride`, a two-digit
//    number whose high digit is the edits count and whose low digit is the
//    unexpected count:
//
//      cost = edits × stride + unexpected,      stride = n + 1
//
//    It works like decimal digits: 31 > 29 because the tens digit decides
//    before the units digit is looked at; here the edits digit decides before
//    the unexpected digit. With n = 3 (base 4):
//
//      (0, 0) = 0    (1, 0) = 4    (1, 1) = 5    (1, 3) = 7    (2, 0) = 8
//
//    Why the base is n + 1: a digit must stay below its base, or it carries
//    into the next digit. Each unexpected move reads one segment of the
//    message, so no path has more than n unexpected segments: the low digit is
//    always 0 … n, below n + 1, and never carries. With a smaller base it
//    would: in base 2, (1, 3) would be 5 and outrank (2, 0) = 4, though it has
//    fewer edits.
//
//    What one number buys:
//      - adding costs adds both digits at once, with no carry, so a path's
//        cost is the plain sum of its moves' costs;
//      - comparing and sorting costs is plain `<` and numeric order;
//      - the table of costs is one Float64Array, with Infinity for "no path",
//        instead of a pair per state.
//    Doubles hold integers exactly up to 2^53, far above any cost here.
//
//    The same idea in the literature: packing a lexicographic tuple into one
//    integer as a mixed-radix (positional) number, as in radix sort; see
//    Knuth, The Art of Computer Programming, Vol. 2, section 4.1 "Positional
//    Number Systems", and Vol. 3, section 5.2.5 "Sorting by Distribution".
//
// 4. The moves (moves() lists them in priority order)
//
//    from instruction     move        goes to         (edits, unexpected)  in code
//    -------------------  ----------  --------------  -------------------  ----------------
//    split                each target (target, at)    (0, 0)               0
//    open, close          next        (next, at)      (0, 0)               0
//    segment, any, z      consume     (next, at + 1)  (0, 0)               0
//    segment, any, z,     pass over   (pc, at + 1)    (0, 0)               0
//      match
//    segment, any, z      displace    (next, at + 1)  (2, 1)               2 * stride + 1
//    segment, any, z      missing     (next, at)      (1, 0)               stride
//    segment, any, z,     unexpected  (pc, at + 1)    (1, 1)               stride + 1
//      match
//
//    consume applies only when the instruction takes the segment (consumer()).
//    pass over applies only to a Z-segment the schema does not name, while
//    Z-segments are allowed. open and close also record the group, for the
//    edits' paths.
//
//    displace is a missing and an unexpected move in one step: on the grid,
//    the diagonal for "down then right" or "right then down". The segment
//    read stands where the schema segment should be. Schema MSH PID OBR,
//    message MSH PV1 OBR, at (PID, 1) with PV1 next:
//
//      ↓ then →    missing PID, then unexpected PV1   (1, 0) + (1, 1)
//      → then ↓    unexpected PV1, then missing PID   (1, 1) + (1, 0)
//      ↘           displace: both in one move          (2, 1)
//
//    All three cost (2, 1): displace costs exactly the sum of the two moves
//    it combines, so it is never cheaper and never changes a cost to go.
//    Pass 1 leaves it out (section 7a).
//
//    It only decides ties, in pass 2. For one wrong segment, as above, it
//    reports what "↓ then →" would: PID missing and PV1 unexpected, both at
//    index 1. It matters for a run of wrong segments. Without it, missing
//    comes before unexpected, so every missing segment is reported first and
//    every unexpected one after. With it, each segment read is paired with
//    the schema segment at its position. ADMIT (MSH EVN PID PV1), message
//    MSH PIDX PV:
//
//      without displace     EVN, PID, PV1 missing          at 1
//                           PIDX unexpected                at 1
//                           PV unexpected                  at 2
//      displace (chosen)    EVN missing, PIDX unexpected   at 1
//                           PID missing, PV unexpected     at 2
//                           PV1 missing                    at 3
//
//    A displace records missing then unexpected, at the same index. It never
//    wins against a cheaper route: when the segment read is valid after the
//    missing one, missing alone costs (1, 0) and is taken (test "reports a
//    required segment as missing, not as displaced").
//
//    split, open, close, and missing stay in the column; the others move one
//    column right.
//
// 5. The process, in the order the functions run
//
//    repair()              builds the Search (the inputs and the cost table),
//                          then:
//      costsToGo()           PASS 1, columns n down to 0
//        costsAt()             one column:
//          startingStates()      cost of the moves that leave the column,
//                                through leaving()
//          settleQueue()         hands out states in order of cost
//          spread()              lowers costs along moves inside the column
//      cheapest()            PASS 2, walks forward along tight moves
//        onCheapestPath()      the tight moves out of a state, by priority
//          moves()               all moves out of a state, by priority
//      edits()               turns the chosen path's events into RepairEdits
//
// 6. Worked example (schema-level; the compiled program adds split, open and
//    close instructions between these rows, all free)
//
//    schema  MSH OBR OBX        message  MSH OBX        n = 2, stride = 3
//
//    Pass 1, cost to go as (edits, unexpected). Rows are what the schema
//    expects next; column `at` has input[at] next (MSH, then OBX, then
//    nothing):
//
//                  at = 0    at = 1    at = 2
//      MSH         (1, 0)    (2, 0)    (3, 0)
//      OBR         (2, 1)    (1, 0)    (2, 0)
//      OBX         (1, 1)    (0, 0)    (1, 0)
//      match       (2, 2)    (1, 1)    (0, 0)
//
//    Column 2 first: nothing is left to read, so each row costs one missing
//    segment per slot still to go. Then column 1, then column 0. For example
//    toGo(OBR, 1), with OBX next, takes the cheapest of
//      displace    (2, 1) + toGo(OBX, 2) = (2, 1) + (1, 0) = (3, 1)
//      missing     (1, 0) + toGo(OBX, 1) = (1, 0) + (0, 0) = (1, 0)   ← min
//      unexpected  (1, 1) + toGo(OBR, 2) = (1, 1) + (2, 0) = (3, 1)
//    and toGo(MSH, 0) = (1, 0) is the answer: one edit, none unexpected.
//
//    Pass 2 starts at (MSH, 0), whose cost to go is (1, 0):
//      consume MSH → (OBR, 1):  (0, 0) + (1, 0) = (1, 0)   tight, take it
//      at (OBR, 1), OBX next, cost to go (1, 0):
//        consume     OBX is not OBR, so this move does not exist
//        displace    (3, 1)                                  not tight
//        missing     (1, 0)                                  tight, take it
//      at (OBX, 1): consume OBX → (match, 2)                 tight, done
//    Edits: [{ type: "missing", segment: "OBR", index: 1, path: [] }].
//
// 7. Invariants to keep in mind when reading or changing this file
//
//    a. moves(), leaving(), and predecessorsOnce() describe the same graph.
//       moves() lists every move out of a state (pass 2). leaving() covers the
//       moves that leave the column, and the predecessors the moves that stay
//       in it (pass 1). If they disagree, pass 2 can reach a state with no
//       tight move and the invariant in cheapest() fires.
//       displace is the one move only moves() lists. Its cost, (2, 1), is
//       never below a missing move followed by an unexpected one, which pass
//       1 already counts, so leaving it out of pass 1 changes no cost to go.
//       It exists for pass 2: listed before missing, it makes a tie go to the
//       reading that reports a segment out of place next to the one it stands
//       in for.
//    b. Pass 1 handles columns right to left, so every move that leaves a
//       column lands on costs already final.
//    c. Within a column, states settle in increasing cost (Dijkstra's rule),
//       so the first time a state settles, its cost is final.
//    d. Pass 2 keeps: (cost of the path so far) + toGo(current state) equals
//       toGo(start, 0), the optimum. Every move it takes is tight.
//
// 8. References
//
//    - ADR 0025 (this decision) and ADR 0023 decision 3 (the runner's
//      priorities, which pass 2 extends).
//    - The program and its instructions: Russ Cox, "Regular Expression
//      Matching: the Virtual Machine Approach",
//      https://swtch.com/~rsc/regexp/regexp2.html. runner.ts and compile.ts
//      follow it; read it first if `pc`, split, and thread are unfamiliar.
//    - Edit distance by dynamic programming: Wagner and Fischer, "The
//      String-to-String Correction Problem", JACM 21(1), 1974. The cost-to-go
//      table is the same idea, against a language instead of one string.
//    - Correction for regular languages in linear time: R. A. Wagner,
//      "Order-n Correction for Regular Languages", CACM 17(5), 1974,
//      doi:10.1145/360980.360995. Over an NFA: Myers and Miller,
//      "Approximate Matching of Regular Expressions", Bull. Math. Biol. 51,
//      1989, doi:10.1007/BF02458834.
//    - Shortest paths and Dijkstra's algorithm: Cormen, Leiserson, Rivest
//      and Stein, Introduction to Algorithms, chapter "Single-Source
//      Shortest Paths"; dynamic programming and Bellman's principle in the
//      "Dynamic Programming" chapter.
//    - Bucket queues for small integer weights, the idea behind
//      settleQueue(): R. B. Dial, "Algorithm 360: Shortest-Path Forest with
//      Topological Ordering", CACM 12(11), 1969; also known as 0-1 BFS when
//      the weights are 0 and 1.
//    - The context-free generalization the issue cites: Aho and Peterson,
//      "A Minimum Distance Error-Correcting Parser for Context-Free
//      Languages", SIAM J. Comput. 1(4), 1972.

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
//
// Note: a path is recorded as a linked list that grows at the head, like
// the runner's thread history. Two paths that share a beginning share those
// list cells, so extending a path costs one object, not a copy. edits()
// reads the list back to front with replay().
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
//
// Note: everything both passes read, built once in repair(). Passing this
// one object keeps the helpers' signatures short; nothing in it changes
// except the two typed arrays, which pass 1 fills.
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
  //
  // Note: the base of the two-digit cost (guide, section 3): stride = n + 1,
  // one more than the most unexpected segments a path can have, so the
  // unexpected digit never carries into the edits digit.
  readonly stride: number;
  // By state (position * code.length + pc), its cost to go.
  //
  // Note: the 2-D table toGo(pc, at) flattened into one array, one column
  // after another: index = at * code.length + pc. A Float64Array holds
  // Infinity, the "no path yet" value, and integers exactly. For a 101-segment
  // ORU_R01 and a program of a few hundred instructions this is tens of
  // thousands of numbers, allocated once per repair.
  readonly toGo: Float64Array;
  // By instruction, the last position at which its cost to go settled (-1:
  // none).
  //
  // Note: pass 1's "already done" mark for the column it is working on.
  // Storing the position, not a boolean, means moving to the next column
  // needs no reset: a mark from another column simply does not equal `at`.
  // runner.ts uses the same trick with its `generation` counter.
  readonly settled: Int32Array;
}

// A move from one state to another, what it costs, and the last event it
// records, linked to the move's earlier events, if any.
//
// Note: `event` is undefined for split moves, which record nothing. A
// displace move records two events, missing then unexpected, as a two-cell
// chain; after() splices that chain onto the path.
type Move = Readonly<{ pc: number; at: number; cost: number; event?: Event }>;

// A state the forward walk has reached, and the last event on its way there.
type Visit = Readonly<{ pc: number; at: number; last: Event | undefined }>;

// By instruction, the instructions that reach it without reading a segment,
// and how many missing segments that takes: none through split, open, and
// close, and one from a segment instruction.
//
// Note: the moves that stay in a column, stored backwards: for each
// instruction, who can move to it. Pass 1 needs them backwards because it
// computes a cost to go: once it knows the cost from state X, it lowers the
// cost of every state that can move to X.
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
  // Note, step 0: the program, shared with runner() through compileOnce(),
  // so a schema compiles once whichever runs first.
  const program = compileOnce(schema);
  const { code, segmentIds } = program;
  const allowZSegments = options?.allowZSegments ?? true;
  // Note, step 1: everything the passes read. `passable` answers, per
  // position, "may this segment be skipped for free?", computed once here
  // so the passes never repeat the Z-segment test.
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

  // Note, step 2 (pass 1): fill toGo for every state.
  costsToGo(search, predecessorsOnce(program));
  // Note, steps 3 and 4 (pass 2, then reporting): find the first cheapest
  // path from the start, then read its edits.
  return edits(cheapest(search, program.start), input);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
//
// Note: this section defines the graph's edges, the table in section 4 of
// the guide. moves() is the complete list for one state, in priority order;
// the helpers below build its entries. Pass 2 is the only caller of moves().
// Pass 1 uses leaving() and the predecessors instead (invariant 7a).

// The moves out of state (`pc`, `at`), in the runner's priority order.
//
// Note: the order is the tie-breaker. For a segment instruction it is
// consume, pass over, displace, missing, unexpected. A split lists its
// targets in the compiler's priority order (enter before skip, repeat before
// leave, earlier alternative first), so pass 2 inherits the runner's
// grouping choices unchanged.
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
      // Note: at match the schema is done, so the only ways on are to read
      // further segments as passed over (Z) or unexpected. A message with
      // extra segments after a complete message ends here.
      return [...reading(search, pc, at), ...unexpected(search, pc, at)];
    }
  }
}

// The zero-cost moves that read the segment at `at`: consuming it, then
// passing over it.
//
// Note: the two free ways to advance one column. At the last position
// there is nothing to read, so it returns no move.
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
//
// Note: cost 2 × stride + 1 is (2 edits, 1 unexpected), exactly the cost of
// "missing, then unexpected" taken separately. It adds no cheaper path; it
// only lets pass 2 prefer the reading that reports the out-of-place segment
// next to the one it stands in for (ADR 0025 decision 2). The event chain is
// missing → unexpected, so edits() reports the missing segment first.
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
//
// Note: the program stays where it is (`pc` unchanged) and the message
// advances. Cost stride + 1 is (1 edit, 1 unexpected).
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
//
// Note: the same rule as the runner's step(): a segment instruction takes
// its own ID, `any` (Hxx) takes every segment, `z` (anyZSegment) takes
// every segment that starts with Z.
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
//
// Note: PASS 1. Goal: toGo(pc, at) for every state.
//
// Split the moves by where they land:
//   - moves that go one column right (consume, pass over, unexpected) land
//     in column at + 1, which is already final because columns are done
//     right to left (invariant 7b). leaving() takes the cheapest of these.
//   - moves that stay in the column (split, open, close: free; missing: one
//     edit) land in the same column. Their costs depend on each other, and
//     can form cycles (a repeating group whose body can match nothing), so
//     they need a shortest-path computation inside the column.
//
// Inside a column this is a shortest-path problem with many sources (every
// state's leaving() cost) and edges of weight 0 or stride. Dijkstra's
// algorithm solves it by settling states in increasing cost. With only two
// edge weights, no heap is needed (Dial's idea, see References): the sources
// sorted once, plus a plain FIFO for states reached through a missing move,
// already give states in increasing cost.

// The moves within a position, reversed, for each program.
//
// Note: built once per program and cached, like the program itself, since
// it depends only on the schema. `1` marks a missing move (one edit), `0`
// the free ones.
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
//
// Note: one column of pass 1, in three steps:
//   1. startingStates(): every state's cost through a move that leaves the
//      column, the "sources", sorted.
//   2. settleQueue(): hands out states in increasing cost.
//   3. spread(): for each state handed out, lowers the costs of the states
//      that move to it inside the column.
// A state can be queued twice (once as a source, once reached more cheaply);
// the `settled` mark makes only its first, cheapest turn count.
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
//
// Note: the sort is the log factor in O(n · m log m). Only states that can
// leave the column (segment instructions, and match) have a starting cost;
// split, open, and close get theirs from spread().
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
//
// Note: a merge of two sorted lists, like the merge step of merge sort.
// List 1 is the sorted sources. List 2 is filled while the column runs: when
// a state with cost c settles, every state one missing move away gets c +
// stride. States settle in increasing c, so list 2 is appended in increasing
// order and needs no sorting. next() always returns the cheaper head, which
// is Dijkstra's "settle the cheapest unsettled state" without a heap.
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
//
// Note: the "relax" step of Dijkstra, run backwards along the predecessors.
// For each state `from` that can move to `to`:
//   through = cost of `to` + cost of the move
//   if through beats what `from` has, `from` gets it.
// A free move (split, open, close) gives `from` the same cost, which is the
// cost being settled now, so `from` is settled right away (the inner stack).
// A missing move gives `from` a cost one edit higher, so it waits its turn in
// the queue.
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
//
// Note: the base case and the column-crossing moves of pass 1.
//   - (match, n) costs 0: the schema is done and the message is read.
//   - otherwise, the cheapest of: consume (free), pass over (free), and
//     unexpected (stride + 1), each plus the target's cost in column at + 1.
// It computes the same numbers as reading() and unexpected() without building
// Move objects, because pass 1 calls it for every state of every column;
// pass 2 calls moves() only along the path it walks.
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

// Note: toGo(pc, at), read from the flattened table.
function costOf(search: Search, pc: number, at: number): number {
  return search.toGo[at * search.code.length + pc] ?? Infinity;
}

// ---------------------------------------------------------------------------
// The cheapest path
// ---------------------------------------------------------------------------
//
// Note: PASS 2. Goal: one cheapest path from (start, 0) to (match, n), and
// among those, the first in priority order.
//
// Many paths can be cheapest. A path is cheapest exactly when every move on
// it is tight, so the tight moves form a smaller graph whose start-to-end
// paths are the cheapest paths. A depth-first search of that graph, trying
// moves in priority order, finds first the path whose choices come earliest
// in that order, the same way a backtracking parser finds its first parse.
// The runner's Pike VM gives that same first reading for a message that fits,
// which is why a message the runner matches gets no edits here.
//
// Why two passes and not one forward Dijkstra: a single forward search keeps,
// for each state, whichever path settles it first at the least cost. A path
// that made its edit at an earlier position reaches each state before one
// that edits later, so ties would always go to the earliest edit. Against
// the schema `MSH Hxx`, the message `MSH` would read as "MSH missing, and the
// message's MSH fills Hxx" instead of "Hxx missing at the end". Knowing the
// cost to go first lets pass 2 compare paths by their whole sequence of
// choices.

// Walks from `start` at the first position to match after the last, depth
// first, along the moves that keep to a cheapest path, most preferred first.
// Returns the last event of the first path that arrives.
//
// Note: an iterative depth-first search with an explicit stack, like the
// runner's addThread(). Pushing the tight moves in reverse puts the most
// preferred on top, so it is explored first. `visited` stops a cycle of free
// moves, and means a state that led nowhere is not explored again. A tight
// move always exists from a state that is not the end (Lemma 2 in the
// visualizer), so the invariant at the bottom only fires if moves(),
// leaving(), and the predecessors disagree (invariant 7a).
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
//
// Note: the tight test, cost(m) + toGo(target) === toGo(here), is exact
// because costs are integers stored in a Float64Array.
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
//
// Note: a move's events are built with `previous: undefined` at the bottom
// of their chain (one event, or two for displace). This copies the chain and
// hangs its bottom on the path so far.
function after(event: Event, last: Event | undefined): Event {
  return {
    ...event,
    previous: event.previous ? after(event.previous, last) : last,
  };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------
//
// Note: REPORTING. Turns the chosen path's history into RepairEdits. It
// replays the path from the start, keeping two counters:
//   index  how many message segments the path has read, so far
//   open   the IDs of the groups the path is inside, outermost first
// A missing segment is reported at the current index (the index it would be
// inserted at) inside the groups open there. An unexpected segment is
// reported at its own index, inside the groups of the segment before it,
// which is where a Z-segment would be placed (ADR 0023 decision 7).

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

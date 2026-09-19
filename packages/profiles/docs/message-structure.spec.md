# Message Structures

`profiles.events.load(version, id)` returns a `MessageStructureDefinition` for one HL7v2 message structure, such as `ORU_R01`:

```ts
type MessageStructureDefinition = Readonly<{
  structure: MessageStructure; // the structure as the standard defines it
  program: StructureProgram; // the structure compiled for runner() and matchStructure()
}>;
```

`structure` is the bundled data: one JSON file per version and structure, under `src/profiles/v<version>/events/`, generated from the HL7 v2 XML message schemas. `program` is compiled from it when the definition is loaded, once per structure and process.

## `MessageStructure`

```ts
type MessageStructure = Readonly<{
  id: string;
  elements: readonly StructureElement[];
}>;
type StructureElement = SegmentElement | GroupElement | ChoiceElement;
```

Every element carries `optional` (the standard's `[ ]`) and `repeating` (its `{ }`).

- **`segment`**: `{ type: "segment", name }`. The name `Hxx` stands for any segment.
- **`group`**: `{ type: "group", name, elements }`, a segment group such as `PATIENT_RESULT`.
- **`choice`**: `{ type: "choice", alternatives }`, the standard's `< A | B >`: exactly one alternative per occurrence. Every alternative matches at least one segment. A choice is not a group and adds no level to a match.

`segment()`, `group()`, and `choice()` build these elements; `compileStructure()` validates a structure and compiles it. `@glion/profiles/message-structure.schema.json` is the JSON Schema of this shape; each bundled file names it in `$schema` by its `$id`, `https://glion.dev/schemas/message-structure/v1.json`. The profile generator writes it with the structures.

## `StructureProgram`

A Thompson NFA over segment names, as plain data:

```ts
type StructureProgram = Readonly<{
  start: number;
  final: number;
  groups: readonly string[]; // group names, by group number
  segments: readonly (string | null)[]; // the segment each state consumes, or null
  edges: readonly (readonly [target: number, action: number])[][]; // per state, highest priority first
}>;
```

A state with a segment moves to the next state number when it consumes that segment. Every other state moves along its edges without consuming anything; an edge's `action` opens (`g + 1`) or closes (`-(g + 1)`) group `g`, or is `0`.

Edges are ordered so that the program prefers, in this order: entering an optional element rather than skipping it, repeating an element rather than leaving it, and the earlier alternative of a choice.

## Runner

```ts
const automaton = runner(program);

automaton.consume("PID"); // { type: "step" } or { type: "invalid", symbol, expected }
automaton.accepted; // the segments so far form a complete message
automaton.expected; // segment names valid next, sorted
```

The runner follows every state the program can be in at once and needs no group bookkeeping. A runner is single-use: create one per message. After the first `invalid` event every later `consume()` returns `invalid` with an empty `expected`.

## Grouping

```ts
matchStructure(program, ["MSH", "PID", "OBR", "OBX"]);
// [0, { name: "PATIENT_RESULT", children: [
//   { name: "PATIENT", children: [1] },
//   { name: "ORDER_OBSERVATION", children: [2, { name: "OBSERVATION", children: [3] }] },
// ] }]
```

`matchStructure` runs the program as a Pike VM: one thread per reading of the segments so far, in priority order, deduplicated by state so that the higher-priority thread wins, each carrying its group actions. It returns the accepting thread's grouping as segment indexes nested in groups, or `undefined` when the segments do not fit the structure. A group occurrence that holds no segment is left out. It never backtracks: time is proportional to the segments times the size of the program. See ADR 0023.

# @glion/profiles

HL7v2 version-specific profile data — segments, fields, datatypes, and tables — with LRU-cached loaders.

## What it does

`@glion/profiles` is the data source for Glion's profile-aware plugins. It provides structured HL7v2 profile definitions for every supported version (2.3 through 2.8), loaded on demand and cached in memory. The annotation plugins (`@glion/annotate-profile-*`) and the profile lint rules (`@glion/lint-profile-*`) read from this package to enrich and validate HL7v2 messages against the HL7-published specifications.

## Install

```bash
npm install @glion/profiles
```

## Use

```ts
import { profiles } from "@glion/profiles";

const msh = await profiles.segments.load("2.5", "MSH");
console.log(msh.fields.length); // => 21

const field = await profiles.fields.load("2.5", "MSH", "9");
console.log(field.name); // => "Message Type"
console.log(field.required); // => true
console.log(field.datatype); // => "MSG"

const cx = await profiles.datatypes.load("2.5", "CX");
console.log(cx.kind); // => "composite"
console.log(cx.components.length); // => 10
```

Message structures use the same API:

```ts
const adt = await profiles.events.load("2.5", "ADT_A01");
// adt.structure — the structure as the standard defines it
// adt.program — the structure compiled for runner() and matchStructure()
```

## API

### `profiles`

Shared singleton store (eager LRU cache, 100 entries per kind). Use this unless you need a bespoke cache configuration.

### `createProfiles(options)`

Construct a dedicated store with a custom cache size or eviction strategy.

```ts
import { createLruCache, createProfiles } from "@glion/profiles";

const store = createProfiles({
  cache: createLruCache({ maxEntries: 500 }),
});
```

### Loaders on each store

| Method                                      | Returns                      |
| ------------------------------------------- | ---------------------------- |
| `segments.load(version, segmentId)`         | `SegmentDefinition`          |
| `fields.load(version, segmentId, position)` | `FieldProfile`               |
| `datatypes.load(version, datatypeId)`       | `DatatypeDefinition`         |
| `tables.load(version, tableId)`             | `Table`                      |
| `events.load(version, structureId)`         | `MessageStructureDefinition` |
| `codeSystems.load(version, codeSystemId)`   | `CodeSystemDefinition`       |

### `loadSegments(version)`

Standalone helper that loads every segment definition for a given version in one call. Used by batch-processing plugins.

`events.load` resolves trigger-event aliases (`ADT_A04` → `ADT_A01`) unless called with `{ resolve: false }`.

### `loadMessageStructure(tree)`

Returns the message structure a parsed message names, with its compiled program, or `undefined` when MSH-12 or MSH-9 is missing or the version defines no such structure. Reads the version from MSH-12.1, and the structure from MSH-9.3, or from the event maps for MSH-9.1 and MSH-9.2 when MSH-9.3 is empty.

```ts
import { loadMessageStructure } from "@glion/profiles";
import { parseHL7v2 } from "@glion/parser";

const definition = await loadMessageStructure(parseHL7v2(message));
// definition?.structure.id === "ADT_A01"
```

### `segment(name, occurrence?)`, `group(name, elements, occurrence?)`, `choice(alternatives, occurrence?)`

Build a `MessageStructure`, for a structure the bundled profiles do not define. `occurrence` is `{ optional?, repeating? }`, the standard's `[ ]` and `{ }`; both default to `false`.

```ts
import { choice, compileStructure, group, segment } from "@glion/profiles";

const program = compileStructure({
  id: "ADT_A01_SITE",
  elements: [
    segment("MSH"),
    segment("EVN"),
    segment("PID"),
    group(
      "VISIT",
      [segment("PV1"), segment("ZPV", { optional: true, repeating: true })],
      {
        optional: true,
      }
    ),
    choice([segment("OBX"), segment("NTE")], { optional: true }),
  ],
});
```

A compiled program works wherever a bundled one does: `runner`, `matchStructure`, and the `program` option of `@glion/lint-profile-events-segments-order`.

### `runner(program)`

Returns a single-use runner that validates segment order against a message structure, one segment at a time.

```ts
import { profiles, runner } from "@glion/profiles";

const { program } = await profiles.events.load("2.5", "ADT_A01");
const automaton = runner(program);
automaton.consume("MSH"); // { type: "step" }
automaton.consume("ZZZ"); // { type: "invalid", symbol: "ZZZ", expected: ["EVN", "SFT"] }
automaton.accepted; // false
```

`expected` lists segment names sorted; `Hxx` stands for any segment. After the first `invalid` event every later `consume()` returns `invalid` with an empty `expected`.

### `matchStructure(program, segmentNames)`

Returns the segment indexes nested in the groups the message structure defines, or `undefined` when the segments do not fit the structure.

```ts
import { matchStructure, profiles } from "@glion/profiles";

const { program } = await profiles.events.load("2.5", "ORU_R01");
matchStructure(program, ["MSH", "PID", "OBR", "OBX"]);
// [0, { name: "PATIENT_RESULT", children: [
//   { name: "PATIENT", children: [1] },
//   { name: "ORDER_OBSERVATION", children: [2, { name: "OBSERVATION", children: [3] }] },
// ] }]
```

Where the structure admits more than one grouping, the match enters an optional element rather than skip it, repeats an element rather than leave it, and takes the earlier alternative of a choice. A group occurrence that holds no segment is left out. `Hxx` in a structure matches any segment. Runs in time proportional to the number of segments times the size of the program.

### `compileStructure(structure)`

Returns the `StructureProgram` for a `MessageStructure`: plain data that survives `JSON.stringify`. `events.load` compiles each structure once and caches the result. Throws when the structure has no elements, a segment or group has no name, a group has no elements, a choice has no alternatives, or a choice alternative can match no segment.

## Profile data format

Each kind of profile is loaded on demand, the first time it is requested, and cached.

### Segments

```ts
interface SegmentDefinition {
  id: string; // "MSH", "PID", ...
  name: string; // "Message Header"
  fields: FieldProfile[]; // in positional order
}
```

### Fields

```ts
interface FieldProfile {
  id: string; // "MSH-9"
  name: string; // "Message Type"
  position: number; // 9
  datatype: string; // "MSG"
  required: boolean;
  repeatable: boolean;
  maxLength?: number;
  table?: string; // "HL70001" when the field is coded
  item?: string;
}
```

### Datatypes

```ts
interface DatatypeDefinition {
  id: string; // "CX"
  kind: "primitive" | "composite";
  title: string;
  components?: ComponentProfile[]; // only for composite kind
}
```

### Message structures

```ts
type MessageStructure = { id: string; elements: StructureElement[] };

type StructureElement =
  | { type: "segment"; name: string; optional: boolean; repeating: boolean }
  | {
      type: "group";
      name: string;
      optional: boolean;
      repeating: boolean;
      elements: StructureElement[];
    }
  | {
      type: "choice";
      optional: boolean;
      repeating: boolean;
      alternatives: StructureElement[];
    };
```

`optional` is the standard's `[ ]` and `repeating` its `{ }`. A `choice` is the standard's `< A | B >`: exactly one alternative per occurrence, and every alternative matches at least one segment.

### Message structure JSON Schema

`@glion/profiles/message-structure.schema.json` is the JSON Schema (draft-07) of a message structure, with `$id` `https://glion.dev/schemas/message-structure/v1.json`. Every bundled structure names it by that `$id` in `$schema` and conforms to it. The schema checks the shape; `compileStructure` also checks that every choice alternative matches at least one segment.

```ts
import schema from "@glion/profiles/message-structure.schema.json" with { type: "json" };
```

### Tables, code systems

Same shape convention: each exposes its id, version, and the typed payload (value lists for tables, concept lists with displayNames for code systems).

## Part of Glion

`@glion/profiles` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

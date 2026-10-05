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

Event schemas use the same API:

```ts
const adt = await profiles.events.load("2.5", "ADT_A01");
// adt.id       === "ADT_A01"
// adt.elements — the segments, groups, and choices, as the standard defines them
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

| Method                                      | Returns                |
| ------------------------------------------- | ---------------------- |
| `segments.load(version, segmentId)`         | `SegmentDefinition`    |
| `fields.load(version, segmentId, position)` | `FieldProfile`         |
| `datatypes.load(version, datatypeId)`       | `DatatypeDefinition`   |
| `tables.load(version, tableId)`             | `Table`                |
| `events.load(version, schemaId)`            | `EventSchema`          |
| `codeSystems.load(version, codeSystemId)`   | `CodeSystemDefinition` |

### `loadSegments(version)`

Standalone helper that loads every segment definition for a given version in one call. Used by batch-processing plugins.

`events.load` resolves trigger-event aliases (`ADT_A04` → `ADT_A01`) unless called with `{ resolve: false }`.

### `loadEventSchema(tree)`

Returns the schema of the event a parsed message carries, or `undefined` when MSH-12 or MSH-9 is missing or the version defines no such schema. Reads the version from MSH-12.1, and the schema from MSH-9.3, or from the event maps for MSH-9.1 and MSH-9.2 when MSH-9.3 is empty. Never rejects.

```ts
import { loadEventSchema } from "@glion/profiles";
import { parseHL7v2 } from "@glion/parser";

const schema = await loadEventSchema(parseHL7v2(message));
// schema?.id === "ADT_A01"
```

### An event schema of your own

An `EventSchema` is plain data, the shape `event-schema.schema.json` describes: `segment`, `group`, and `choice` elements, each with `optional` (the standard's `[ ]`) and `repeating` (its `{ }`). `runner` takes it as it takes a bundled one.

```ts
import type { EventSchema } from "@glion/profiles";

const schema: EventSchema = {
  id: "ADT_A01_SITE",
  elements: [
    { type: "segment", name: "MSH", optional: false, repeating: false },
    { type: "segment", name: "PID", optional: false, repeating: false },
    {
      type: "group",
      name: "VISIT",
      optional: true,
      repeating: false,
      elements: [
        { type: "segment", name: "PV1", optional: false, repeating: false },
        { type: "segment", name: "ZPV", optional: true, repeating: true },
      ],
    },
  ],
};
```

A schema of your own works wherever a bundled one does: `runner` and the `definition` option of `@glion/lint-profile-segment-order`. `runner` throws when the schema has no elements, a segment or group has no name, a group has no elements, a choice has no alternatives, or a choice alternative can match no segment.

### `runner(schema, segmentIds)`

Runs a message's segment IDs through an event schema: validates their order and groups them. Returns one of:

| `type`         | Fields                                                                                | When                                                |
| -------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `"matched"`    | `groups`: the segment indexes nested in the groups the schema defines                 | the segments fit the schema                         |
| `"mismatched"` | `index`: the first segment that does not fit; `expected`: the segment IDs valid there | a segment the schema does not allow at its position |
| `"incomplete"` | `expected`: the segment IDs that can come next                                        | every segment fits, but the schema requires more    |

```ts
import { profiles, runner } from "@glion/profiles";

const schema = await profiles.events.load("2.5", "ORU_R01");

runner(schema, ["MSH", "PID", "OBR", "OBX"]);
// { type: "matched", groups: [0, { name: "PATIENT_RESULT", children: [
//   { name: "PATIENT", children: [1] },
//   { name: "ORDER_OBSERVATION", children: [2, { name: "OBSERVATION", children: [3] }] },
// ] }] }

runner(schema, ["MSH", "PID", "OBR", "MSH"]);
// { type: "mismatched", index: 3, expected: ["NTE", "OBX", …] }
```

`expected` is sorted; `Hxx` in a schema matches any segment ID and is listed as `Hxx`. Where the schema admits more than one grouping, the runner enters an optional element rather than skip it, repeats an element rather than leave it, and takes the earlier alternative of a choice. A group occurrence that holds no segment is left out. Runs in time proportional to the number of segments times the size of the schema.

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

### Event schemas

```ts
type EventSchema = { id: string; elements: EventSchemaElement[] };

type EventSchemaElement =
  | { type: "segment"; name: string; optional: boolean; repeating: boolean }
  | {
      type: "group";
      name: string;
      optional: boolean;
      repeating: boolean;
      elements: EventSchemaElement[];
    }
  | {
      type: "choice";
      optional: boolean;
      repeating: boolean;
      alternatives: EventSchemaElement[];
    };
```

`optional` is the standard's `[ ]` and `repeating` its `{ }`. A `choice` is the standard's `< A | B >`: exactly one alternative per occurrence, and every alternative matches at least one segment.

### Event schema JSON Schema

`@glion/profiles/event-schema.schema.json` is the JSON Schema (draft-07) of an event schema, with `$id` `https://glion.dev/schemas/event-schema/v1.json`. Every bundled schema names it by that `$id` in `$schema` and conforms to it. The schema checks the shape; `runner` also requires that every choice alternative matches at least one segment.

```ts
import schema from "@glion/profiles/event-schema.schema.json" with { type: "json" };
```

### Tables, code systems

Same shape convention: each exposes its id, version, and the typed payload (value lists for tables, concept lists with displayNames for code systems).

## Part of Glion

`@glion/profiles` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

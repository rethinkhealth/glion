# @glion/profiles

HL7v2 profile data for each version — event schemas, segments, fields, datatypes, tables, and code systems — with loaders, and a runner that validates and groups a message's segments against its event schema.

## What it does

`@glion/profiles` is the data source for Glion's profile-aware plugins. It provides structured HL7v2 profile definitions for every supported version (2.1 through 2.8.2), loaded on demand, once per process. The annotation plugins (`@glion/annotate-profile-*`) and the profile lint rules (`@glion/lint-profile-*`) read from this package to enrich and validate HL7v2 messages against the HL7-published specifications.

## Install

```bash
npm install @glion/profiles
```

## Use

```ts
import { profiles, runner } from "@glion/profiles";

const fields = await profiles.fields.load("2.5", "MSH");
const msh9 = fields.bySequence.get(9);
msh9?.name; // => "Message Type"
msh9?.datatype; // => "MSG"

const schema = await profiles.events.load("2.5", "ADT_A04");
schema.id; // => "ADT_A01", the event schema ADT^A04 uses

runner(schema, ["MSH", "EVN", "PID", "PV1"]);
// => { type: "matched", groups: [0, 1, 2, 3] }
```

## API

### `profiles`

The profile stores: `events`, `eventMaps`, `fields`, `datatypes`, `tables`, and `codeSystems`.

### Stores

| Method                                | Resolves                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `events.load(version, id)`            | `EventSchema`, by event (`ADT_A04`) or schema ID (`ADT_A01`)                 |
| `eventMaps.load(version)`             | `EventMap`: the event schema ID of each event, such as `ADT_A04` → `ADT_A01` |
| `fields.load(version, segmentId)`     | `FieldDefinition`                                                            |
| `datatypes.load(version, datatypeId)` | `DatatypeDefinition`                                                         |
| `tables.load(version, tableNumber)`   | `TableDefinition`                                                            |
| `codeSystems.load(codeSystemId)`      | `CodeSystemDefinition`                                                       |

`load` resolves `undefined` for a profile the version does not bundle, and rejects only when a bundled profile fails to load. Each profile loads once per process; later loads of it resolve the same value, and a load that fails is retried by the next call.

### `loadSegments(version)`

Resolves the segment definitions of a version: each segment ID with its title, or `undefined` for a version not bundled.

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

### `runner(schema, segmentIds[, options])`

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

#### Z-segments

A Z-segment (a segment ID that starts with `Z`) that the schema does not name fits at any position, as HL7v2 allows local Z-segments in any message and segment group. It is grouped right after the segment before it, in that segment's group. A Z-segment the schema names is matched like any other segment. A reading that reaches an `Hxx` takes the Z-segment there rather than pass over it.

| Option           | Type      | Default | Description                                                                                           |
| ---------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `allowZSegments` | `boolean` | `true`  | When `false`, a Z-segment the schema does not name is a mismatch, like any segment it does not allow. |

```ts
runner(schema, ["MSH", "PID", "ZPI", "OBR", "OBX"]);
// { type: "matched", groups: [0, { name: "PATIENT_RESULT", children: [
//   { name: "PATIENT", children: [1, 2] },
//   { name: "ORDER_OBSERVATION", children: [3, { name: "OBSERVATION", children: [4] }] },
// ] }] }

runner(schema, ["MSH", "PID", "ZPI", "OBR", "OBX"], { allowZSegments: false });
// { type: "mismatched", index: 2, expected: ["NK1", "NTE", "OBR", …] }
```

## Glossary

### HL7v2 terms

| Term                 | Meaning                                                                                         | In a message        |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| Version              | The HL7v2 version a message follows, such as `2.5.1`. Every profile belongs to one version.     | MSH-12.1            |
| Message type         | What kind of message it is, such as `ADT` or `ORU`.                                             | MSH-9.1             |
| Trigger event        | What happened, such as `A04` (patient registered).                                              | MSH-9.2             |
| Event                | A message type and trigger event together, written `ADT_A04`.                                   | MSH-9.1 and MSH-9.2 |
| Message structure ID | The ID of the event schema a message follows, such as `ADT_A01`. Several events share one.      | MSH-9.3             |
| Segment              | A line of a message, named by a three-character segment ID such as `PID`.                       | Each segment        |
| Field, component     | A segment's fields, numbered from 1 (PID-3), and the components of a composite field (PID-3.1). |                     |
| Datatype             | The type of a field or component, such as `CX` (composite) or `ST` (primitive).                 |                     |
| Table                | A version's list of allowed codes for a field, such as table `0001` (Administrative Sex).       |                     |
| Code system          | The HL7 Terminology (UTG) form of a table, such as `v2-0001`, the same across versions.         |                     |

### Glion names

| Name                                            | Meaning                                                                                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile                                         | The data this package bundles about one thing in one version: an event schema, a segment's fields, a datatype, a table, or the version's segments. Code systems are the one kind without a version. |
| Event schema (`EventSchema`)                    | The structure an event's messages follow: its segments in order, nested in groups and choices, as the standard defines it. Its `id` is the message structure ID.                                    |
| Event map (`EventMap`)                          | For each version, the event schema ID each event and each schema ID maps to, such as `ADT_A04` → `ADT_A01`.                                                                                         |
| Element (`EventSchemaElement`)                  | One node of an event schema: a segment (`SegmentElement`), a named group of elements (`GroupElement`), or a choice between alternatives (`ChoiceElement`).                                          |
| Occurrence (`Occurrence`)                       | Every element's `optional` (the standard's `[ ]`) and `repeating` (its `{ }`). An element that is neither occurs exactly once.                                                                      |
| Z-segment                                       | A locally defined segment: its ID starts with `Z`. HL7v2 allows one in any message and segment group.                                                                                               |
| `Hxx`                                           | A segment element that matches any segment ID.                                                                                                                                                      |
| Runner (`runner`)                               | Runs a message's segment IDs through an event schema once: validates their order and groups them. Its result (`RunnerResult`) is `matched`, `mismatched`, or `incomplete`.                          |
| Groups (`SegmentMatch`, `GroupMatch`)           | What a `matched` result carries: each segment's index in the message, nested in the group occurrences (`GroupMatch`) it belongs to.                                                                 |
| Store (`profiles.events`, `profiles.fields`, …) | The loader of one kind of profile: `load(version, id)` resolves the profile, or `undefined` for one it does not bundle.                                                                             |

### Naming convention

- **Event** names what is keyed or looked up by trigger event: `profiles.events`, `profiles.eventMaps`. **Event schema** names the data an event resolves to: `EventSchema`, `event-schema.schema.json`. **Message structure** names only the MSH-9.3 value, the schema's `id`.
- **`…Definition`** is what a store resolves: `FieldDefinition`, `DatatypeDefinition`, `TableDefinition`, `SegmentDefinition`, `CodeSystemDefinition`. **`…Profile`** and **`…Entry`** are one item inside it: `FieldProfile`, `ComponentProfile`, `SegmentProfile`, `TableCodeEntry`, `UtgCodeEntry`. **`…Module`** is the shape of a bundled data file.
- **`…Element`** is a node of an event schema; **`…Match`** is a node of the groups a `runner` result carries.
- A version is a string without a prefix, `"2.5.1"`. A table loads by its number, `"0001"`, while a field names it with the HL7 prefix, `"HL70001"`. A code system ID has the UTG prefix, `"v2-0001"`.

## Profile data format

Each profile is loaded on demand, the first time it is requested, and kept for the life of the process.

### Segments

```ts
interface SegmentDefinition {
  byId: ReadonlyMap<string, { id: string; title: string }>; // "PID" → "Patient Identification"
}
```

### Fields

```ts
interface FieldDefinition {
  segmentId: string; // "MSH"
  bySequence: ReadonlyMap<number, FieldProfile>; // 9 → MSH-9
  requiredSequences: ReadonlySet<number>;
}

interface FieldProfile {
  sequence: number; // 9
  id: string; // "MSH-9"
  name?: string; // "Message Type"
  datatype: string; // "MSG"
  required: boolean;
  repeatable: boolean;
  maxLength?: number;
  table?: string; // "HL70001" when the field is coded
  item?: string; // the HL7 data element number
}
```

### Datatypes

```ts
interface DatatypeDefinition {
  id: string; // "CX"
  version: string; // "2.5"
  kind: string; // "primitive" or "composite"
  title?: string;
  componentsBySequence: ReadonlyMap<number, ComponentProfile>; // empty for a primitive
  requiredSequences: ReadonlySet<number>;
}

interface ComponentProfile {
  sequence: number;
  name: string;
  datatypeId: string;
  required: boolean;
  maxLength?: number;
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

### Tables and code systems

```ts
interface TableDefinition {
  id: string; // "0001"
  description: string; // "Administrative Sex"
  type: "user" | "hl7";
  codes: ReadonlyMap<string, { name: string; description: string }>; // "F" → "Female"
}

interface CodeSystemDefinition {
  id: string; // "v2-0001"
  url: string;
  oid?: string;
  name: string;
  title: string;
  codes: ReadonlyMap<string, { code: string; display: string; status: string }>;
}
```

## Part of Glion

`@glion/profiles` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

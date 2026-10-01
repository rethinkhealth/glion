# @glion/profiles

HL7v2 version-specific profile data — segments, fields, datatypes, tables, message structures, and UTG code systems — loaded per version.

## What it does

`@glion/profiles` is the data source for Glion's profile-aware plugins. It provides structured HL7v2 profile definitions for every supported version (2.1 through 2.8.2). Each loader loads one kind of profile for one version on first use and returns the same map on every later call. The annotation plugins (`@glion/annotate-profile-*`) and the profile lint rules (`@glion/lint-profile-*`) read from this package to enrich and validate HL7v2 messages against the HL7-published specifications.

## Install

```bash
npm install @glion/profiles
```

## Use

```ts
import { loadDatatypes, loadFields } from "@glion/profiles";

const fields = await loadFields("2.5");
const msh9 = fields?.get("MSH")?.bySequence.get(9);
console.log(msh9?.name); // => "Message Type"
console.log(msh9?.datatype); // => "MSG"

const datatypes = await loadDatatypes("2.5");
console.log(datatypes?.get("CX")?.componentsBySequence.size); // => 10
```

## API

### Loaders

Each loader resolves a `ReadonlyMap` of every profile of its kind in a version, or `undefined` for a version not bundled. A version loads once; later calls resolve the same map. Lookups on the map are synchronous.

| Loader                           | Resolves                                               | Keyed by                    |
| -------------------------------- | ------------------------------------------------------ | --------------------------- |
| `loadFields(version)`            | `ReadonlyMap<string, FieldDefinition> \| undefined`    | segment ID, `"PID"`         |
| `loadDatatypes(version)`         | `ReadonlyMap<string, DatatypeDefinition> \| undefined` | datatype ID, `"CX"`         |
| `loadTables(version)`            | `ReadonlyMap<string, TableDefinition> \| undefined`    | table number, `"0001"`      |
| `loadMessageStructures(version)` | `ReadonlyMap<string, MessageStructure> \| undefined`   | structure ID, `"ADT_A01"`   |
| `loadSegments(version)`          | `SegmentDefinition \| undefined`                       | segment ID, in `byId`       |
| `loadCodeSystems()`              | `ReadonlyMap<string, CodeSystemDefinition>`            | code system ID, `"v2-0001"` |

`loadMessageStructures` keys structures by structure ID. A trigger event such as `ADT_A04` maps to its structure through `resolveMessageStructure(version, messageCode, triggerEvent)` or `eventMaps`.

UTG code systems are not versioned by HL7v2 version.

### `loadMessageStructure(tree)`

Returns the message structure a parsed message names, or `undefined` when MSH-12 or MSH-9 is missing or the version defines no such structure. Reads the version from MSH-12.1, and the structure from MSH-9.3, or from the event maps for MSH-9.1 and MSH-9.2 when MSH-9.3 is empty.

```ts
import { loadMessageStructure } from "@glion/profiles";
import { parseHL7v2 } from "@glion/parser";

const structure = await loadMessageStructure(parseHL7v2(message));
// structure?.id === "ADT_A01"
```

### A message structure of your own

A `MessageStructure` is plain data, the shape `message-structure.schema.json` describes: `segment`, `group`, and `choice` elements, each with `optional` (the standard's `[ ]`) and `repeating` (its `{ }`). `runner` and `matchStructure` take it as they take a bundled one.

```ts
import type { MessageStructure } from "@glion/profiles";

const structure: MessageStructure = {
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

A structure of your own works wherever a bundled one does: `runner`, `matchStructure`, and the `definition` option of `@glion/lint-profile-events-segments-order`. Both functions throw when the structure has no elements, a segment or group has no name, a group has no elements, a choice has no alternatives, or a choice alternative can match no segment.

### `runner(structure)`

Returns a single-use runner that validates segment order against a message structure, one segment at a time.

```ts
import { loadMessageStructures, runner } from "@glion/profiles";

const structures = await loadMessageStructures("2.5");
const structure = structures?.get("ADT_A01");
if (!structure) throw new Error("ADT_A01 is not bundled for 2.5");

const automaton = runner(structure);
automaton.consume("MSH"); // { type: "step" }
automaton.consume("ZZZ"); // { type: "invalid", symbol: "ZZZ", expected: ["EVN", "SFT"] }
automaton.accepted; // false
```

`expected` lists segment names sorted; `Hxx` stands for any segment. After the first `invalid` event every later `consume()` returns `invalid` with an empty `expected`.

### `matchStructure(structure, segmentNames)`

Returns the segment indexes nested in the groups the message structure defines, or `undefined` when the segments do not fit the structure.

```ts
import { loadMessageStructures, matchStructure } from "@glion/profiles";

const structures = await loadMessageStructures("2.5");
const structure = structures?.get("ORU_R01");
if (!structure) throw new Error("ORU_R01 is not bundled for 2.5");

matchStructure(structure, ["MSH", "PID", "OBR", "OBX"]);
// [0, { name: "PATIENT_RESULT", children: [
//   { name: "PATIENT", children: [1] },
//   { name: "ORDER_OBSERVATION", children: [2, { name: "OBSERVATION", children: [3] }] },
// ] }]
```

Where the structure admits more than one grouping, the match enters an optional element rather than skip it, repeats an element rather than leave it, and takes the earlier alternative of a choice. A group occurrence that holds no segment is left out. `Hxx` in a structure matches any segment. Runs in time proportional to the number of segments times the size of the structure.

## Profile data format

### Segments

```ts
interface SegmentDefinition {
  byId: ReadonlyMap<string, { id: string; title: string }>; // "MSH" → { id: "MSH", title: "Message Header" }
}
```

### Fields

```ts
interface FieldDefinition {
  segmentId: string; // "PID"
  bySequence: ReadonlyMap<number, FieldProfile>;
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
  item?: string;
}
```

### Datatypes

```ts
interface DatatypeDefinition {
  id: string; // "CX"
  version: string; // "2.5"
  kind: string; // "primitive" or "composite"
  title?: string;
  componentsBySequence: ReadonlyMap<number, ComponentProfile>;
  requiredSequences: ReadonlySet<number>;
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

`@glion/profiles/message-structure.schema.json` is the JSON Schema (draft-07) of a message structure, with `$id` `https://glion.dev/schemas/message-structure/v1.json`. Every bundled structure names it by that `$id` in `$schema` and conforms to it. The schema checks the shape; `runner` and `matchStructure` also require that every choice alternative matches at least one segment.

```ts
import schema from "@glion/profiles/message-structure.schema.json" with { type: "json" };
```

### Tables

```ts
interface TableDefinition {
  id: string; // "0001"
  description: string; // "Administrative Sex"
  type: "user" | "hl7";
  codes: ReadonlyMap<string, { name: string; description: string }>; // "F" → { name: "F", description: "Female" }
}
```

### Code systems

```ts
interface CodeSystemDefinition {
  id: string; // "v2-0001"
  url: string; // "http://terminology.hl7.org/CodeSystem/v2-0001"
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

# @glion/profiles

HL7v2 version-specific profile data — segments, fields, datatypes, and tables — with loaders that load each profile once per process.

## What it does

`@glion/profiles` is the data source for Glion's profile-aware plugins. It provides structured HL7v2 profile definitions for every supported version (2.3 through 2.8), loaded on demand, once per process. The annotation plugins (`@glion/annotate-profile-*`) and the profile lint rules (`@glion/lint-profile-*`) read from this package to enrich and validate HL7v2 messages against the HL7-published specifications.

## Install

```bash
npm install @glion/profiles
```

## Use

```ts
import { profiles } from "@glion/profiles";

const fields = await profiles.fields.load("2.5", "MSH");
const msh9 = fields.bySequence.get(9);
msh9?.name; // => "Message Type"
msh9?.datatype; // => "MSG"

const definition = await profiles.events.load("2.5", "ADT_A04");
// definition — the segment-order automaton of ADT_A01, the structure ADT^A04 uses
```

## API

### `profiles`

The profile stores: `events`, `fields`, `datatypes`, `tables`, and `codeSystems`. Each profile loads once per process; later loads of it resolve the same value, and a load that fails is retried by the next call.

### Loaders on each store

| Method                                | Returns                |
| ------------------------------------- | ---------------------- |
| `fields.load(version, segmentId)`     | `FieldDefinition`      |
| `datatypes.load(version, datatypeId)` | `DatatypeDefinition`   |
| `tables.load(version, tableId)`       | `TableDefinition`      |
| `events.load(version, id)`            | `Definition`           |
| `codeSystems.load(codeSystemId)`      | `CodeSystemDefinition` |

### `loadSegments(version)`

Standalone helper that loads every segment definition for a given version in one call. Used by batch-processing plugins.

### Automaton runner

For segment-order validation, `@glion/profiles` exposes the underlying DFA engine:

```ts
import { runner, type Definition } from "@glion/profiles";

const engine = runner(definition);
engine.step("MSH");
engine.step("EVN");
// engine.state === RunnerState.Running
```

## Profile data format

Each kind of profile is loaded on demand from pre-built chunks. The compiled output is sharded into ~170 chunks (merged from ~10,800 source files via Rolldown code-splitting) to keep install size and cold-start cost low.

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

### Tables, event structures, code systems

Same shape convention: each exposes its id, version, and the typed payload (value lists for tables, DFA definitions for event structures, concept lists with displayNames for code systems).

## Part of Glion

`@glion/profiles` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

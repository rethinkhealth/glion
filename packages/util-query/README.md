# @glion/util-query

Reads HL7v2 ASTs using canonical paths like `PID.5[1].2.1` or `ORDER.ORC.1`.

## What it does

Provides six path-based helpers — `parse`, `select`, `selectAll`, `value`, `matches`, `format` — that operate on HL7v2 AST trees using dotted paths: segment groups, the segment, and the field are each separated with `.`, so HL7 element `PID-5.1` is the path `PID.5.1`. Paths can address segments (`PID`), groups (`ORDER`), nested groups and segments (`ORDER.TIMING.TQ1`), field repetitions (`PID.5[2]`), components (`PID.5[1].2`), and subcomponents (`PID.5[1].2.1`).

## Install

```bash
npm install @glion/util-query
```

## Use

```typescript
import {
  select,
  selectAll,
  value,
  matches,
  format,
  parse,
} from "@glion/util-query";
import { parseHL7v2 } from "@glion/parser";

const message = `MSH|^~\\&|MyApp|MyFacility|ReceivingApp|ReceivingFacility|20231201120000||ADT^A01|12345|P|2.5
PID|1||123456789^^^MRN||Smith^John^Michael||19800101|M|||123 Main St^^Anytown^ST^12345
OBX|1||8675-3^Glucose^LN||120|mg/dL|70-105|H|||F`;

const ast = parseHL7v2(message);

// Values: drills to subcomponents automatically when the path is unique
const lastName = value(ast, "PID.5[1].1.1"); // "Smith"
const sendingApp = value(ast, "MSH.3[1].1.1"); // "MyApp"

// Single node: grab the first matching AST node
const pidSegment = select(ast, "PID");
if (pidSegment?.node.type === "segment") {
  console.log(`PID has ${pidSegment.node.children.length - 1} fields`);
}

// Multiple nodes
const allObservations = selectAll(ast, "OBX");
for (const { node } of allObservations) {
  console.log(`Found observation: ${node.type}`);
}

// Existence check
if (matches(ast, "PID.5")) {
  console.log("Patient has a name field");
}

// Path parsing
const parsed = parse("ORDERS[2].OBX.5[1].2.1");
```

## API

### `parse(path: string): PathParts`

Breaks a canonical HL7 path into structured pieces.

```typescript
parse("PID.5[1].2.1");
// {
//   segment: { name: 'PID' },
//   field: 5,
//   repetition: 1,
//   component: 2,
//   subcomponent: 1
// }
```

`parse` returns a new `PathParts` on every call.

### `select<Path>(node: Root | Group | Segment, path: Path): { node: InferNodeType<Path>; ancestors: Nodes[] } | null`

Returns the node the path addresses under `node`, along with its ancestor chain, or `null` when it cannot be found. `node` is a message, a group, or a segment; a path read from a segment starts with the field. A step without `[n]` names the first child with that name, so `select` returns `null` when that child does not lead to a match, even if a later one does. The return type is inferred from the path string.

```typescript
const result = select(ast, "PID.5[1].2");
if (result) {
  result.node; // Type: Component
  result.ancestors; // [Root, Segment, Field, FieldRepetition]
}

select(pid, "5[1].2"); // the same component, read from the PID segment
```

The `ancestors` array follows the [`unist-util-visit-parents`](https://github.com/syntax-tree/unist-util-visit-parents) convention: it starts at the node passed to `select`, ends with the immediate parent, and never includes the node itself. You can rely on `ancestors[ancestors.length - 1]` being the direct parent.

### `selectAll<Path>(node: Root | Group | Segment, path: Path): Array<{ node: InferNodeType<Path>; ancestors: Nodes[] }>`

Returns every node the path addresses under `node`, in document order. `node` is a message, a group, or a segment, as in `select`.

```typescript
// Get all OBX segments
const observations = selectAll(ast, "OBX");
for (const { node } of observations) {
  console.log(node.type); // 'segment'
}

// Get all ORDER groups
const orders = selectAll(ast, "ORDER");
for (const { node } of orders) {
  console.log(node.type); // 'group'
}

// Get all observation values
const values = selectAll(ast, "OBX.5");
for (const { node } of values) {
  console.log(node.type); // 'field'
}
```

### `value(node: Root | Group | Segment, path: string): { value: string | null; node: Nodes; ancestors: Nodes[] } | null`

Returns the string value stored at the path under `node`, a message, a group, or a segment. If the node is not a subcomponent, it walks through single-child layers (field → field repetition → component → subcomponent) automatically.

```typescript
const result = value(ast, "PID.3[1].1.1");
if (result) {
  console.log(result.value); // "123456789"
  console.log(result.node.type); // "subcomponent"
  console.log(result.ancestors); // [Root, Segment, Field, ...]
}

value(pid, "3[1].1.1")?.value; // "123456789", read from the PID segment
```

### `matches(node: Root | Group | Segment, path: string): boolean`

Returns `true` when `select` finds a node at the path under `node`, otherwise `false`.

```typescript
if (!matches(ast, "OBX.5")) {
  throw new Error("Missing observation value");
}

if (matches(ast, "PID.5")) {
  const name = value(ast, "PID.5.1.1");
}
```

### `format(node: Nodes, ancestors: Nodes[]): string | null`

The inverse of `select`. Given a node and its ancestor chain (as returned by `visit` or `select`), produces the canonical path string that would select that node. Returns `null` if the chain contains no segment or group.

```typescript
// With select
const result = select(ast, "PID.5.2");
if (result) {
  format(result.node, result.ancestors); // "PID.5.2"
}

// With visit
visit(ast, "field", (node, ancestors) => {
  const path = format(node, ancestors); // "PID.5", "OBX.1", etc.
  console.log(`Visiting ${path}`);
});

// select(root, format(node, ancestors)) returns node
```

### `delimiters(root: Root, fallback?: Partial<Delimiters>): Delimiters`

Returns the delimiters the message header declares: MSH-1 is the field separator, and MSH-2's encoding characters are the component separator, repetition separator, escape character, and subcomponent separator, in that order. A delimiter MSH-2 does not declare is absent. The field separator is `|` when MSH-1 is not one character. A message without a message header segment has the delimiters `|^~\&`.

```typescript
delimiters(ast); // MSH|^~\&  → { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }
delimiters(ast); // MSH|^~&   → { field: "|", component: "^", repetition: "~", escape: "&" }
```

A message that does not open with a message header segment that has fields has the delimiters `fallback`, over `|^~\&`, as `@glion/parser` reads such a message with its settings.

### `msh(root: Root | Group): Segment | undefined`

Returns the message header segment the message opens with, after any empty lines, or `undefined` when it opens with another segment.

```typescript
msh(ast); // MSH|^~\&|A  → the MSH segment
msh(ast); // PID|1 then MSH|^~\&|A  → undefined
```

### `QueryError`

Every function that takes a path throws a `QueryError` when it cannot read the path; `path` carries the path.

| `code`         | Cause                                      |
| -------------- | ------------------------------------------ |
| `EMPTY_PATH`   | The path is empty.                         |
| `INVALID_PATH` | The path does not follow the path grammar. |

```typescript
import { QueryError } from "@glion/util-query";

try {
  select(ast, userPath);
} catch (error) {
  if (error instanceof QueryError && error.code === "INVALID_PATH") {
    // userPath is not a path; error.path holds it
  }
}
```

### Types

```typescript
type PathParts = {
  groups?: Array<{ name: string; repetition?: number }>;
  segment?: { name: string; repetition?: number };
  field?: number;
  repetition?: number;
  component?: number;
  subcomponent?: number;
};
```

## Path format

Canonical path grammar:

- `SEGMENT` — segment (e.g., `PID`)
- `SEGMENT.FIELD` — field (e.g., `PID.5`)
- `SEGMENT.FIELD[REP]` — field repetition (e.g., `PID.5[2]`)
- `SEGMENT.FIELD[REP].COMP` — component (e.g., `PID.5[1].2`)
- `SEGMENT.FIELD[REP].COMP.SUB` — subcomponent (e.g., `PID.5[1].2.1`)
- `GROUP[N].` — qualify with group ID and optional repetition (e.g., `PATIENT_RESULT.ORDER_OBSERVATION[2].OBR.4`)
- `FIELD[REP].COMP.SUB` — the same steps without the segment, read from a segment (e.g., `5[1].2.1`)

Every step of a path is separated with `.`. A name starts with a letter and a field is a number, so the first numeric step is the field: in `ORDER.OBR.5.1`, `ORDER` is a group, `OBR` the segment, `5` the field, and `1` the component. Positions count from 1. A string that does not follow this grammar, such as `PID-5.1`, `PID.0`, or `" PID"`, throws `INVALID_PATH`.

A segment name or group ID is an uppercase letter followed by uppercase letters, digits, and underscores, such as `PID` or `PATIENT_RESULT`. A path names a group by its `id`, not its `name`: a group with ID `PATIENT_VISIT` and name `Patient Visit` is `PATIENT_VISIT`.

Repetition indexes are **1-based**. If you omit `[n]`, `select`/`value`/`matches` take the first child with that name at that step, and `selectAll` takes every one. In a message whose first `ORDER` has no `OBX` and whose second has one, `select(ast, "ORDER.OBX")` returns `null` and `selectAll(ast, "ORDER.OBX")` returns the second `ORDER`'s `OBX`; `ORDER[2].OBX` selects it.

Every step names a direct child of the node before it, and the first step names a direct child of the node the path is read from: a message or a group holds segments and groups, and a segment holds fields, so a path read from a segment starts with the field. A path that starts with the field finds nothing in a message or a group, and a path that starts with a name finds nothing in a segment. `ORDER.ORC` is an `ORC` directly inside an `ORDER` group directly under the message; an `ORC` nested deeper is not matched. A path to a node inside a group therefore names every group from the message down: in an `ORU_R01` grouped by `@glion/transform-profile-groups`, the patient is `PATIENT_RESULT.PATIENT.PID` and an observation is `PATIENT_RESULT.ORDER_OBSERVATION.OBSERVATION.OBX`.

A path's meaning depends on the tree's grouping. On a flat tree, as the parser produces it, every segment is a direct child of the message, so `PID.3` and `OBX[2].5` match. After grouping, only segments left at the top level, such as `MSH`, match by name alone; `PID.3` returns `null` until the path names `PID`'s groups.

`[n]` counts the direct children with that name, segments and groups together: in `[MSH, PID, OBX, PID]`, the second `PID` is `PID[2]`, and a group `ZZZ` after a segment `ZZZ` is `ZZZ[2]`. A step without a field number matches a segment or a group; a field number matches only a segment.

`format(node, ancestors)` returns the path that `select` resolves back to `node`.

```typescript
// Selecting a top-level group
const orderGroup = select(ast, "ORDER");
if (orderGroup?.node.type === "group") {
  console.log("Found ORDER group");
}

// Selecting segments
const pid = select(ast, "PID");
if (pid?.node.type === "segment") {
  console.log("Found PID segment");
}

// Navigation through groups to segments
value(ast, "ORDER.ORC.1"); // Order control
value(ast, "ORDER.TIMING.TQ1.1"); // Timing quantity
```

## Common recipes

### Patient demographics

```typescript
const lastName = value(ast, "PID.5[1].1.1")?.value;
const firstName = value(ast, "PID.5[1].2.1")?.value;
const middleName = value(ast, "PID.5[1].3.1")?.value;
const dob = value(ast, "PID.7[1].1.1")?.value;
```

### Observations

```typescript
import { selectAll, value } from "@glion/util-query";

// Single observation
const obsValue = value(ast, "OBX.5[1].1.1")?.value;
const units = value(ast, "OBX.6[1].1.1")?.value;
const refRange = value(ast, "OBX.7[1].1.1")?.value;

// Multiple observations: read each OBX from the segment
for (const { node: obx } of selectAll(ast, "OBX")) {
  const val = value(obx, "5")?.value;
  const u = value(obx, "6")?.value;
  console.log(`${val} ${u}`);
}
```

### Validation

```typescript
if (!matches(ast, "MSH")) throw new Error("Missing message header");
if (!matches(ast, "PID.3[1].1.1")) throw new Error("Missing patient ID");

if (matches(ast, "OBX")) {
  const observations = selectAll(ast, "OBX");
  console.log(`Found ${observations.length} observations`);
}
```

## Part of Glion

`@glion/util-query` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

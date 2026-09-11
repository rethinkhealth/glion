# @glion/util-query

Reads HL7v2 ASTs using canonical paths like `PID-5[1].2.1` or `ORDER-ORC-1`.

## What it does

Provides six path-based helpers — `parse`, `select`, `selectAll`, `value`, `matches`, `format` — that operate on HL7v2 AST trees using the same path syntax found in HL7 specs. Paths can address segments (`PID`), groups (`ORDER`), nested groups and segments (`ORDER-TIMING-TQ1`), field repetitions (`PID-5[2]`), components (`PID-5[1].2`), and subcomponents (`PID-5[1].2.1`). Path parsing is memoized in an LRU cache so repeated lookups stay fast.

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
const lastName = value(ast, "PID-5[1].1.1"); // "Smith"
const sendingApp = value(ast, "MSH-3[1].1.1"); // "MyApp"

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
if (matches(ast, "PID-5")) {
  console.log("Patient has a name field");
}

// Path parsing
const parsed = parse("ORDERS[2]-OBX-5[1].2.1");
```

## API

### `parse(path: string): PathParts`

Breaks a canonical HL7 path into structured pieces. Useful for tooling and diagnostics.

```typescript
parse("PID-5[1].2.1");
// {
//   segment: { name: 'PID' },
//   field: 5,
//   repetition: 1,
//   component: 2,
//   subcomponent: 1
// }
```

`parse` memoizes up to 1,000 unique paths using an LRU cache so repeated lookups stay fast without leaking memory.

### `select<Path>(root: Root, path: Path): { node: InferNodeType<Path>; ancestors: Nodes[] } | null`

Returns the first AST node addressed by the path, along with its ancestor chain, or `null` when it cannot be found. The return type is automatically inferred from the path string.

```typescript
const result = select(ast, "PID-5[1].2");
if (result) {
  result.node; // Type: Component
  result.ancestors; // [Root, Segment, Field, FieldRepetition]
}
```

The `ancestors` array follows the [`unist-util-visit-parents`](https://github.com/syntax-tree/unist-util-visit-parents) convention: it starts at the root node, ends with the immediate parent, and never includes the node itself. You can rely on `ancestors[ancestors.length - 1]` being the direct parent.

### `selectAll<Path>(root: Root, path: Path): Array<{ node: InferNodeType<Path>; ancestors: Nodes[] }>`

Returns all AST nodes that match the path. Useful when a message contains multiple segments or groups of the same type.

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
const values = selectAll(ast, "OBX-5");
for (const { node } of values) {
  console.log(node.type); // 'field'
}
```

### `value(root: Root, path: string): { value: string; node: Nodes; ancestors: Nodes[] } | null`

Returns the string value stored at the path. If the node is not a subcomponent, it walks through single-child layers (field → field repetition → component → subcomponent) automatically.

```typescript
const result = value(ast, "PID-3[1].1.1");
if (result) {
  console.log(result.value); // "123456789"
  console.log(result.node.type); // "subcomponent"
  console.log(result.ancestors); // [Root, Segment, Field, ...]
}
```

### `matches(root: Root, path: string): boolean`

Returns `true` when the path points to an existing node, otherwise `false`.

```typescript
if (!matches(ast, "OBX-5")) {
  throw new Error("Missing observation value");
}

if (matches(ast, "PID-5")) {
  const name = value(ast, "PID-5.1.1");
}
```

### `format(node: Nodes, ancestors: Nodes[]): string | null`

The inverse of `select`. Given a node and its ancestor chain (as returned by `visit` or `select`), produces the canonical path string that would select that node. Returns `null` if the chain contains no segment or group.

```typescript
// With select
const result = select(ast, "PID-5.2");
if (result) {
  format(result.node, result.ancestors); // "PID-5.2"
}

// With visit
visit(ast, "field", (node, ancestors) => {
  const path = format(node, ancestors); // "PID-5", "OBX-1", etc.
  console.log(`Visiting ${path}`);
});

// Round-trip: format(select(root, path)) === path
```

### `clearParseCache(): void`

Clears the memoized parse results. Useful for long-running services that want to release memory during idle periods or before reloading configuration.

### `getParseCacheSize(): number`

Returns the current number of cached path entries so you can monitor cache pressure.

### Types

```typescript
type PathParts = {
  groups?: Array<{ name: string; repetition?: number }>;
  segment: { name: string; repetition?: number };
  field?: number;
  repetition?: number;
  component?: number;
  subcomponent?: number;
};
```

## Path format

Canonical path grammar:

- `SEGMENT` — segment (e.g., `PID`)
- `SEGMENT-FIELD` — field (e.g., `PID-5`)
- `SEGMENT-FIELD[REP]` — field repetition (e.g., `PID-5[2]`)
- `SEGMENT-FIELD[REP].COMP` — component (e.g., `PID-5[1].2`)
- `SEGMENT-FIELD[REP].COMP.SUB` — subcomponent (e.g., `PID-5[1].2.1`)
- `GROUP[N]-...` — qualify with group name and optional repetition (e.g., `ORDERS[2]-OBX-5`)

Repetition indexes are **1-based**. If you omit `[n]`, `select`/`value`/`matches` assume `[1]`.

Paths select whatever exists in the AST — segments or groups. A bare name (`NAME`) returns whichever exists, trying segments first; adding a field suffix (`NAME-N`) forces segment access because field numbers only apply to segments. Groups can also appear as navigation prefixes (`ORDER-ORC`, `ORDER-TIMING-TQ1-1`).

Group prefixes and the final name resolve differently. Each group in the prefix must be a direct child of the previous scope (`INSURANCE-ORDER` matches only an `ORDER` group directly inside `INSURANCE`). The final name is searched at any depth below that scope, in document order, so `select(ast, "OBX")` finds an `OBX` nested inside `ORDER-RESULT` and `select(ast, "RESULT")` finds the nested `RESULT` group. `[n]` on the final name indexes that document-order list across depths, matching the segment-sequence convention of the HL7 `ERL` data type: `OBX[3]` is the third `OBX` in the message regardless of grouping, and `ORDER[2]` may be a nested `ORDER` that opens before the second top-level one. Use a group prefix to pin the level when a name occurs at several depths.

Because the final name ignores grouping, a bare segment path returns the same node whether or not a grouping plugin has run on the tree.

```typescript
// Selecting groups directly
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
value(ast, "ORDER-ORC-1"); // Order control
value(ast, "ORDER-TIMING-TQ1-1"); // Timing quantity
```

## Common recipes

### Patient demographics

```typescript
const lastName = value(ast, "PID-5[1].1.1")?.value;
const firstName = value(ast, "PID-5[1].2.1")?.value;
const middleName = value(ast, "PID-5[1].3.1")?.value;
const dob = value(ast, "PID-7[1].1.1")?.value;
```

### Observations

```typescript
// Single observation
const obsValue = value(ast, "OBX-5[1].1.1")?.value;
const units = value(ast, "OBX-6[1].1.1")?.value;
const refRange = value(ast, "OBX-7[1].1.1")?.value;

// Multiple observations
const allOBX = selectAll(ast, "OBX");
for (const { node } of allOBX) {
  const val = value(node, "OBX-5")?.value;
  const u = value(node, "OBX-6")?.value;
  console.log(`${val} ${u}`);
}
```

### Validation

```typescript
if (!matches(ast, "MSH")) throw new Error("Missing message header");
if (!matches(ast, "PID-3[1].1.1")) throw new Error("Missing patient ID");

if (matches(ast, "OBX")) {
  const observations = selectAll(ast, "OBX");
  console.log(`Found ${observations.length} observations`);
}
```

## Error messages

- Invalid formats throw with guidance, e.g. `"Invalid HL7 path format: \"PID-\""`.
- Out-of-range indexes throw, e.g. `"Field number must be ≥1, got: 0"`.
- Whitespace is rejected to catch accidental typos.

## Part of Glion

`@glion/util-query` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

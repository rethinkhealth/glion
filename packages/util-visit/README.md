# @glion/util-visit

Visitor for traversing HL7v2 AST trees with ancestor context, depth, and HL7v2-aware sequence numbers.

## What it does

Walks an HL7v2 AST from any starting node — Root, Segment, Field, Component, or Subcomponent — calling a visitor function for each matching node. Each call receives the node, its ancestors (root-to-parent), and a `VisitInfo` record with index, HL7v2 sequence number, depth, and extracted metadata. Supports filtering by type string, property object, or predicate, and exposes `SKIP`/`EXIT` control actions. Delegates core traversal to `unist-util-visit-parents`.

## Install

```bash
npm install @glion/util-visit
```

## Use

```typescript
import { visit, EXIT, SKIP } from "@glion/util-visit";
import { parse } from "@glion/parser";

const message = parse("MSH|^~\\&|...\rPID|...");

// Visit all segments
visit(message, "segment", (node, ancestors, info) => {
  console.log(`Segment: ${info.metadata?.header} at depth ${info.depth}`);
});

// Find fields with parent context
visit(message, "field", (node, ancestors, info) => {
  const segment = ancestors.find((n) => n.type === "segment");
  console.log(`Field ${info.sequence} in segment`);
});

// Skip processing of sensitive segments
visit(message, (node, ancestors, info) => {
  if (node.type === "segment" && info.metadata?.header === "NTE") {
    return SKIP;
  }
});
```

## API

### `visit(tree, visitor)`

### `visit(tree, test, visitor)`

Visit nodes in an HL7v2 AST tree.

#### Parameters

- `tree` (`Nodes`) — Tree to traverse. Can be any node type, not just `Root`.
- `test` (`string | Partial<Nodes> | Test`, optional) — Filter:
  - `string` — Match nodes by type (e.g., `"segment"`).
  - `Partial<Nodes>` — Match nodes with matching properties (e.g., `{ name: "PATIENT_GROUP" }`).
  - `Test` — Custom function `(node, ancestors) => boolean`.
- `visitor` (`Visitor`) — Function called for each matching node.

#### Returns

`void`.

#### Important: test vs visitor functions

**If you pass a function as the second argument, it is always treated as a Visitor, never as a Test.**

```typescript
// WRONG — testFn will be treated as a visitor, not a test
visit(ast, (node) => node.type === 'segment', ...); // Missing visitor!

// CORRECT — Explicit 3-argument form
visit(ast, (node) => node.type === 'segment', (node, ancestors, info) => {
  console.log('Visiting segment');
});

// CORRECT — Use string or object for simple tests
visit(ast, 'segment', (node, ancestors, info) => {
  console.log('Visiting segment');
});
```

#### Visitor function

```typescript
type Visitor<T extends Nodes = Nodes> = (
  node: T,
  ancestors: Nodes[],
  info: VisitInfo
) => VisitorResult;
```

The visitor receives:

- `node` — Current AST node.
- `ancestors` — Array of ancestor nodes from root to parent (not including current node).
- `info` — Visit information with index, sequence, depth, and metadata.

The visitor can return:

- `undefined` or `void` — Continue traversal normally.
- `SKIP` — Skip children of current node.
- `EXIT` — Stop traversal immediately.

### `VisitInfo`

```typescript
interface VisitInfo {
  /** 0-based index among the parent's children when the node is visited */
  index: number;

  /** `index` + 1, the HL7v2 sequence number */
  sequence: number;

  /** 1-based depth in tree (root = 1) */
  depth: number;

  /** Metadata (e.g., { name: "MSH" } or { name: "PATIENT" }) */
  metadata: Record<string, unknown> | undefined;
}
```

`index` and `sequence` represent the node's **position in the tree**, not its position among filtered results:

```typescript
// Structure: MSH segment with fields at positions 1, 2, 3, 4
// Filter matches only field 3
visit(
  ast,
  (n) => n.type === "field" && hasContent(n),
  (node, ancestors, info) => {
    console.log(info.sequence); // 3 (position in segment, not "1st match")
  }
);
```

This is correct because HL7v2 paths like `PID.3` refer to tree positions, not filtered positions.

The position is read when the node is visited, so it reflects siblings a visitor inserted or removed earlier in the same visit. A visitor that removes the current node can return `info.index` to continue with the sibling that moved into its place:

```typescript
visit(segment, "field", (node, ancestors, info) => {
  if (isEmptyNode(node)) {
    ancestors.at(-1).children.splice(info.index, 1);
    return info.index;
  }
});
```

### Automatic metadata extraction

The `metadata` field is populated automatically:

| Node type | Metadata key | Description                                 |
| --------- | ------------ | ------------------------------------------- |
| `segment` | `header`     | Segment identifier (e.g., `"MSH"`, `"PID"`) |
| `group`   | `name`       | Group name (e.g., `"PATIENT_GROUP"`)        |

### Exports

```typescript
import {
  visit, // Main traversal function
  EXIT, // Return to stop traversal
  SKIP, // Return to skip children
} from "@glion/util-visit";

import type {
  VisitInfo, // { index, sequence, depth, metadata }
  Visitor, // (node, ancestors, info) => VisitorResult
  VisitorResult, // Return type from visitor
  Test, // Filter predicate
  Predicate, // (node, ancestors) => boolean
} from "@glion/util-visit";
```

## Examples

### Filter by node type

```typescript
visit(ast, "segment", (node, ancestors, info) => {
  console.log(`Found segment: ${info.metadata?.header}`);
});
```

### Filter by properties

```typescript
visit(ast, { name: "PATIENT_GROUP" }, (node, ancestors, info) => {
  console.log("Inside PATIENT_GROUP");
});
```

### Custom test function

```typescript
// Visit fields in MSH segment only
visit(
  ast,
  (node, ancestors) => {
    const parent = ancestors.at(-1);
    return node.type === "field" && parent?.type === "segment";
  },
  (node, ancestors, info) => {
    console.log(`Field at sequence ${info.sequence}`);
  }
);
```

### Access parent and ancestors

```typescript
visit(ast, "component", (node, ancestors, info) => {
  const parent = ancestors.at(-1);
  const segment = ancestors.findLast((n) => n.type === "segment");
  console.log(`Component at depth ${info.depth}`);
});
```

### Control flow: skip children

```typescript
visit(ast, (node, ancestors, info) => {
  if (node.type === "segment" && info.metadata?.header === "OBX") {
    return SKIP; // Don't process OBX segment children
  }
});
```

### Control flow: exit early

```typescript
import { EXIT } from "@glion/util-visit";

let found = false;
visit(ast, "field", (node, ancestors, info) => {
  if (/* some condition */) {
    found = true;
    return EXIT; // Stop traversal completely
  }
});
```

### Start from any node

```typescript
import { s, f, c } from "@glion/builder";

// Create a standalone segment
const segment = s("PID", f(c("value1")), f(c("value2")));

// Traverse from segment (not root)
visit(segment, "field", (node, ancestors, info) => {
  console.log(`Field at sequence ${info.sequence}`);
});
```

### Track nesting levels

```typescript
visit(ast, (node, ancestors, info) => {
  const indent = "  ".repeat(info.depth - 1);
  console.log(`${indent}${node.type} [${info.sequence}]`);
});
// root [1]
//   segment [1]
//     segment-header [0]
//     field [1]
//       field-repetition [1]
//         component [1]
```

### Group hierarchy navigation

```typescript
visit(ast, "segment", (node, ancestors, info) => {
  const groups = ancestors
    .filter((n) => n.type === "group")
    .map((n) => (n as any).name)
    .filter((name): name is string => typeof name === "string");

  console.log(`${info.metadata?.header} is in groups: ${groups.join(" > ")}`);
});
// PID is in groups: PATIENT_GROUP
```

### Validate required fields

```typescript
function validateRequiredFields(ast: Root): string[] {
  const errors: string[] = [];

  visit(ast, "segment", (node, ancestors, info) => {
    const segment = node as Segment;
    const header = info.metadata?.header;

    if (header === "MSH" && segment.children.length < 12) {
      errors.push("MSH segment missing required fields");
    }

    if (header === "PID") {
      const patientId = segment.children[3];
      if (!patientId || patientId.children.length === 0) {
        errors.push("PID segment missing required Patient ID (PID.3)");
      }
    }
  });

  return errors;
}
```

### Extract data with context

```typescript
interface PatientName {
  name: string;
  sequence: number;
  inGroup?: string;
}

function extractPatientNames(ast: Root): PatientName[] {
  const names: PatientName[] = [];

  visit(ast, "segment", (node, ancestors, info) => {
    if (info.metadata?.header !== "PID") return;

    const segment = node as Segment;
    const nameField = segment.children[5];
    if (nameField?.children[0]?.children[0]) {
      const nameComponent = nameField.children[0].children[0];
      const name = (nameComponent.children[0] as Subcomponent)?.value || "";
      const groupAncestor = ancestors.find((n) => n.type === "group");

      names.push({
        name,
        sequence: info.sequence,
        inGroup: groupAncestor ? (groupAncestor as any).name : undefined,
      });
    }
  });

  return names;
}
```

### Find first match and exit

```typescript
function findFirstObservation(ast: Root, targetCode: string): string | null {
  let result: string | null = null;

  visit(ast, "segment", (node, ancestors, info) => {
    if (info.metadata?.header !== "OBX") return;

    const segment = node as Segment;
    const identifierField = segment.children[3];
    const code = identifierField?.children[0]?.children[0]?.children[0]?.value;

    if (code === targetCode) {
      const valueField = segment.children[5];
      result = valueField?.children[0]?.children[0]?.children[0]?.value || null;
      return EXIT;
    }
  });

  return result;
}
```

## Part of Glion

`@glion/util-visit` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

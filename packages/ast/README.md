# @glion/ast

TypeScript types and specification for the HL7v2 abstract syntax tree.

## What it does

`@glion/ast` defines the shape of HL7v2 messages as an abstract syntax tree. The tree implements the [`unist`](https://github.com/syntax-tree/unist) spec, so every Glion parser, transformer, linter, and serializer — and any third-party `unist` utility — can consume the same representation. This package ships only TypeScript types; runtime behavior (parsing, visiting, building) lives in the parser, builder, and util packages that consume these types.

## Install

```bash
npm install @glion/ast
```

## Use

```ts
import type { Root, Segment, Field, Subcomponent } from "@glion/ast";

function firstSegment(tree: Root): Segment | undefined {
  return tree.children.find(
    (child): child is Segment => child.type === "segment"
  );
}
```

Use these types whenever you write a plugin, visitor, or helper that operates on the HL7v2 AST — they are the contract shared by every package in the ecosystem.

## API

The package exports interface declarations only. There is no runtime JavaScript.

| Type              | Node kind                  | Role                                                       |
| ----------------- | -------------------------- | ---------------------------------------------------------- |
| `Root`            | `type: "root"`             | Top-level node representing a message or fragment          |
| `Segment`         | `type: "segment"`          | A single HL7v2 segment (MSH, PID, OBX, …)                  |
| `Group`           | `type: "group"`            | A repeating or optional group of related segments          |
| `Field`           | `type: "field"`            | A field within a segment                                   |
| `FieldRepetition` | `type: "field-repetition"` | A `~`-separated instance of a field                        |
| `Component`       | `type: "component"`        | A `^`-separated component within a repetition              |
| `Subcomponent`    | `type: "subcomponent"`     | An `&`-separated subcomponent — the only node with `value` |

Every node may also carry a `position` property (`{ start, end }` with `line`, `column`, and `offset`) following the `unist` spec.

## Node types

The AST mirrors the full HL7v2 delimiter hierarchy:

```text
root
└── segment
    └── field (|)
        └── field-repetition (~)
            └── component (^)
                └── subcomponent (&)
```

- Every `field` always contains one or more `field-repetition` nodes, even when no `~` appears in the input.
- Every `component` always contains one or more `subcomponent` nodes, even when no `&` appears.
- Only `subcomponent` nodes carry a `value` string.

### Abstract shapes

```idl
interface Literal <: UnistLiteral {
  value: string
}

interface Parent <: UnistParent {
  children: [HL7v2Node]
}
```

`Literal` is the leaf (`Subcomponent`). `Parent` is anything that contains other nodes.

### Concrete nodes

```idl
interface Root <: Parent {
  type: 'root'
  children: [Segment | Group]
}

interface Segment <: Parent {
  type: 'segment'
  name?: string
  children: [Field]
}

interface Group <: Parent {
  type: 'group'
  id: string
  name: string
  children: [Segment]
}

interface Field <: Parent {
  type: 'field'
  index: number
  children: [FieldRepetition]
}

interface FieldRepetition <: Parent {
  type: 'field-repetition'
  index?: number
  children: [Component]
}

interface Component <: Parent {
  type: 'component'
  index: number
  children: [Subcomponent]
}

interface Subcomponent <: Literal {
  type: 'subcomponent'
  index: number
  value: string
}
```

`Segment.name` carries the segment identifier (for example `"MSH"`, `"PID"`, `"OBX"`) so visitors can filter without traversing the field hierarchy. `Group.id` identifies the logical group (for example `"ORDER_OBSERVATION"`, `"PATIENT_VISIT"`) and holds only uppercase letters, digits, and `_`; `Group.name` is the group name for display, in title case (for example `"Order Observation"`).

### Position

```idl
interface Position {
  start: Point
  end: Point
}

interface Point {
  line: number
  column: number
  offset: number
}
```

Position is optional per the `unist` spec but is always populated by `@glion/parser`.

### Content model

```idl
type HL7v2Content =
  Root | Segment | Group | Field | FieldRepetition | Component | Subcomponent
```

Delimiters themselves live on `file.data.delimiters` (populated by `@glion/annotate-delimiters`), not on individual nodes — a single source of truth for the six HL7v2 delimiter characters.

## Part of Glion

`@glion/ast` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

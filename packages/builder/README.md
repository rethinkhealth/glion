# @glion/builder

Tiny, typed helpers for assembling HL7v2 ASTs by hand.

## What it does

`@glion/builder` provides five short functions (`m`, `s`, `f`, `r`, `c`) that wrap [`unist-builder`](https://github.com/syntax-tree/unist-builder) and return nodes typed from [`@glion/ast`](../ast/). You build trees with a few function calls instead of nesting `u('node-type', ...)` boilerplate by hand, and the output is the same shape a parser would produce — so any Glion consumer (serializers, linters, annotators) can read it back. The builder is intentionally small: no hidden serialization, no format guessing, no HL7v2 semantics. You decide what the tree looks like; the helpers just reduce the typing.

## Install

```bash
npm install @glion/builder
```

## Use

```ts
import { c, f, m, s } from "@glion/builder";

const tree = m(
  s("MSH", f("|"), f("^~\\&")),
  s(
    "PID",
    f(), // empty field
    f([
      c(["123456", "DOE", "JOHN"]), // arrays and individual args are interchangeable
    ])
  )
);
```

`tree` is a `Root` node containing two segments (`MSH`, `PID`). Pass it to `@glion/to-hl7v2` to serialize, to `@glion/jsonify` to jsonify, or to any `unist` visitor to inspect it.

## API

### `m(...children: RootContent[]): Root`

Build a `Root` (message) node.

- No arguments → empty root.
- Pass any number of `RootContent` nodes (segments, fragments); they are appended in order.
- Arguments are used as-is. Pass concrete AST nodes rather than nested arrays.

### `s(name: string, ...fields: Field[]): Segment`

Build a `Segment` node with the Segment ID `name`.

- No fields → a segment with no fields.
- Fields are appended in the order provided; the helper does not auto-flatten.
- The segment's `terminator` is `\r`, the segment terminator HL7v2 requires. Set `terminator` on the returned node to give it another one.

### `f(...values: Array<string | Component | FieldRepetition | Array<string | Component | FieldRepetition>>): Field`

Build a `Field` node.

- No arguments → empty field (`children: []`).
- Strings become components with a single subcomponent containing the value.
- `Component` instances are added directly.
- `FieldRepetition` instances are preserved so you can control repetitions explicitly.
- Arrays are flattened one level, letting you mix individual values and grouped lists.
- Sequences of strings/components are grouped into a single repetition unless a `FieldRepetition` is introduced explicitly.

### `r(...components: Array<string | Component | Array<string | Component>>): FieldRepetition`

Build a `FieldRepetition` node.

- No arguments → empty field-repetition (`children: []`).
- Strings become components with a single subcomponent containing the value.
- Components are inserted as-is.
- Arrays are flattened one level for convenience.

### `c(...values: Array<string | string[]>): Component`

Build a `Component` node.

- No arguments → empty component (`children: []`).
- Strings become subcomponents.
- Arrays are flattened one level, so `c('DOE', ['JOHN', 'Q'])` works.

For advanced scenarios — multiple repetitions per field, custom metadata, node reuse — drop down to `unist-builder` (`u`) directly and mix those nodes with the helpers above.

## Design

- **Explicit.** You build the same AST shape you would by hand. There is no hidden serialization logic or format guessing.
- **Composable.** Each helper is a thin wrapper over `unist-builder`, so raw nodes from `u()` and other utilities can be mixed freely.
- **Minimal.** A small surface means fewer abstractions to learn and less room for divergent interpretations of the HL7v2 model.

### Empty fields, repetitions, and components

Calling `f()`, `r()`, or `c()` with no arguments produces a node with an empty `children` array — no implicit child placeholders.

```ts
f(); // → { type: "field", children: [] }
r(); // → { type: "field-repetition", children: [] }
c(); // → { type: "component", children: [] }
```

Pass `f("")` (or any explicit string) to materialize the full subcomponent leaf.

## Part of Glion

`@glion/builder` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

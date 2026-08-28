# @glion/parser

`unified`-compatible parser that converts HL7v2 text into a structured AST.

## What it does

`@glion/parser` is a low-level parser that turns raw HL7v2 messages into a `unist`-compatible syntax tree following the [`@glion/ast`](../ast/) spec. It runs as a `unified` parser plugin — feeding its output into any downstream `unified` processor — and auto-detects delimiters from MSH-1 and MSH-2 so non-standard delimiter sets work without configuration. Most applications should use [`@glion/hl7v2`](../hl7v2/), which bundles this parser with the standard transform and compile stages; reach for `@glion/parser` when you are building a custom pipeline.

## Install

```bash
npm install @glion/parser
```

## Use

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

const message = "MSH|^~\\&|SENDING_APP|SENDING_FAC|...\rPID|1||12345";

const tree = unified().use(hl7v2Parser).parse(message);

console.log(tree);
```

## API

### `unified().use(hl7v2Parser[, options])`

Register the parser as the reader for a `unified` processor. The parser reads from the input string and produces a `Root` AST; it never mutates its input.

### Options

| Option       | Type                  | Description                                                                              |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `delimiters` | `Partial<Delimiters>` | Override one or more delimiters. The parser merges with MSH-derived values and defaults. |

The default delimiters are `|` (field), `^` (component), `~` (repetition), `&` (subcomponent), `\` (escape), and `\r` (segment).

### Custom delimiters

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

// Override only the segment delimiter
const tree = unified()
  .use(hl7v2Parser, { delimiters: { segment: "\n" } })
  .parse(message);

// Override multiple delimiters
const customTree = unified()
  .use(hl7v2Parser, {
    delimiters: { field: "$", component: "%", segment: "\n" },
  })
  .parse(customMessage);
```

Options accept a partial `Delimiters` object, so only the characters you want to override need to be provided.

### `Hl7v2Processor`

The `unified` `Processor<Root, Root | undefined, Root | undefined>` type every HL7v2 pipeline satisfies — head and tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable. Use it to type a processor built with `unified().use(hl7v2Parser)` regardless of which transformer or compiler plugins are added. `@glion/mllp` re-exports it unchanged.

```ts
import type { Hl7v2Processor } from "@glion/parser";

const processor: Hl7v2Processor = unified().use(hl7v2Parser).freeze();
```

## Parsing model

- **Pull-based tokenizer.** Single pass, minimal object allocations — suitable for high-throughput ingestion.
- **Delimiter auto-detection.** MSH-1 and MSH-2 are read before the rest of the message is tokenized so custom delimiter sets are honored without configuration.
- **`unist`-compatible output.** Nodes follow the `@glion/ast` spec and integrate with `unist-util-visit`, `unist-builder`, and the wider Glion plugin ecosystem.
- **Streaming-friendly.** The pull-based design is ready for streaming ingestion even though the current public API takes a complete string.

### Empty-field representation

Empty fields, repetitions, and components are represented with `children: []` rather than a placeholder leaf:

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

const tree = unified().use(hl7v2Parser).parse("PID|1||");

// PID-2 (empty field): { type: "field", children: [] }
```

Rules:

- **Leaf nodes** (`Subcomponent`, `SegmentHeader`) with no value carry `value: ""`.
- **Parent nodes** (`Field`, `FieldRepetition`, `Component`) with no content carry `children: []`.
- **Presence vs value:** a node in the parent's `children` array means the position exists; empty `children` means the position has no value.

| Wire format     | Representation                  |
| --------------- | ------------------------------- |
| `PID\|1\|\|`    | Field(children: [])             |
| `PID\|1\|^\|`   | Field → Rep → [Comp[], Comp[]]  |
| `PID\|1\|~\|`   | Field → [Rep[], Rep[]]          |
| `PID\|1\|ABC\|` | Field → Rep → Comp → Sub("ABC") |

## Part of Glion

`@glion/parser` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

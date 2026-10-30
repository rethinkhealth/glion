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

| Option          | Type                  | Description                                                                                                                                                                                                     |
| --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decodeEscapes` | `boolean`             | Whether a subcomponent value holds the characters its escape sequences stand for (`true`, the default) or the escape sequences as written. The encoding characters in MSH-2 are never decoded.                  |
| `lineBreaks`    | `boolean`             | Whether a line feed, or a carriage return and a line feed, also ends a segment (`true`, the default), or only a carriage return does (`false`), as HL7v2 Chapter 2 requires. With `false`, a line feed is data. |
| `delimiters`    | `Partial<Delimiters>` | Override one or more delimiters. The parser merges with MSH-derived values and defaults.                                                                                                                        |

The default delimiters are `|` (field), `^` (component), `~` (repetition), `&` (subcomponent), and `\` (escape). A segment ends with a carriage return, `\r`, which HL7v2 fixes and no setting changes.

### Custom delimiters

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

const customTree = unified()
  .use(hl7v2Parser, {
    delimiters: { field: "$", component: "%" },
  })
  .parse(customMessage);
```

Options accept a partial `Delimiters` object, so only the characters you want to override need to be provided.

### Escape sequences

A value's escape sequences are decoded while the message is tokenized. `\F\`, `\S\`, `\R\`, `\T\`, and `\E\` become the field, component, repetition, subcomponent, and escape delimiters the message declares, `\.br\` becomes the segment terminator, `\r`, and `\Xdd\` becomes the characters its bytes, named by pairs of hexadecimal digits, encode in UTF-8. A formatting command such as `\H\`, `\N\`, or `\.sp 2\`, a locally defined sequence (`\Z…\`), a character set switch (`\Cxxyy\`, `\Mxxyyzz\`), and any other sequence stay as written. A Segment ID runs to the first field delimiter of its line and holds no escape sequences or other delimiters: `Z\R\Z|A` opens with the Segment ID `Z\R\Z`, and `^A|B` with `^A`.

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

unified().use(hl7v2Parser).parse("PID|1||DOE\\T\\SMITH");
// PID-3 subcomponent value: "DOE&SMITH"

unified()
  .use(hl7v2Parser, { decodeEscapes: false })
  .parse("PID|1||DOE\\T\\SMITH");
// PID-3 subcomponent value: "DOE\\T\\SMITH"
```

A node's `position` is the span of the source text, so a decoded value is shorter than its span.

### Line breaks and positions

A segment ends at a carriage return, `\r`, at a line feed, `\n`, or at a carriage return and a line feed, `\r\n`, and the last segment may end without one. No setting changes what ends a segment. With `lineBreaks: false`, a line feed does not end a segment: only a carriage return does. Each segment's `terminator` holds what ended it, and `""` for a last segment with nothing after it; an empty line after a segment is not recorded. A byte order mark at the start of the input is not part of the message: the default `stripBOM` step removes it, and positions count from the character after it. The parser never rewrites the message otherwise: every `position` is a span of its text as it was given. A `preprocess` step that rewrites the input moves positions into the rewritten text.

A segment's `position` ends at its last character, before its line break. The root's `position` covers the message from its first character to its last, the line breaks after its last segment included, so a message ends with a segment terminator when the root ends after its last segment:

```ts
import { parseHL7v2 } from "@glion/parser";

parseHL7v2("MSH|^~\\&\r\nPID|1\r").position; // offsets 0–16
parseHL7v2("MSH|^~\\&\r\nPID|1\r").children[1].position; // offsets 10–15
parseHL7v2("MSH|^~\\&\r\nPID|1").position; // offsets 0–15
parseHL7v2("MSH|^~\\&\r\nPID|1").children[0].terminator; // "\r\n"
parseHL7v2("MSH|^~\\&\r\nPID|1").children[1].terminator; // ""
```

### `Hl7v2Processor`

The `unified` `Processor<Root, Root | undefined, Root | undefined>` type every HL7v2 pipeline satisfies — head and tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable. Use it to type a processor built with `unified().use(hl7v2Parser)` regardless of which transformer or compiler plugins are added. `@glion/mllp` re-exports it unchanged.

```ts
import type { Hl7v2Processor } from "@glion/parser";

const processor: Hl7v2Processor = unified().use(hl7v2Parser).freeze();
```

## Parsing model

- **Pull-based tokenizer.** Single pass, minimal object allocations — suitable for high-throughput ingestion.
- **Delimiter auto-detection.** MSH-1 and MSH-2 are read before the rest of the message is tokenized so custom delimiter sets are honored without configuration.
- **Escape sequences decoded in the same pass.** A text run that holds the escape character is decoded as it is tokenized; a run without one is taken as it is.
- **`unist`-compatible output.** Nodes follow the `@glion/ast` spec and integrate with `unist-util-visit`, `unist-builder`, and the wider Glion plugin ecosystem.
- **Streaming-friendly.** The pull-based design is ready for streaming ingestion even though the current public API takes a complete string.
- **Every field delimiter read as written.** Each field delimiter after the Segment ID opens a field, the last one included: `PID|1||` holds PID-1 and an empty PID-2 and PID-3, `PID|` holds an empty PID-1, and `PID` holds no fields. A line that starts with `|` has an empty Segment ID: `|A` holds one field, `A`.

### Empty-field representation

Empty fields, repetitions, and components are represented with `children: []` rather than a placeholder leaf:

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";

const tree = unified().use(hl7v2Parser).parse("PID|1||");

// PID-2 and PID-3 (empty fields): { type: "field", children: [] }
```

Rules:

- **Leaf nodes** (`Subcomponent`, `SegmentHeader`) with no value carry `value: ""`.
- **Parent nodes** (`Field`, `FieldRepetition`, `Component`) with no content carry `children: []`.
- **Presence vs value:** a node in the parent's `children` array means the position exists; empty `children` means the position has no value.

| Wire format     | PID-2                           |
| --------------- | ------------------------------- |
| `PID\|1\|\|`    | Field(children: [])             |
| `PID\|1\|^\|`   | Field → Rep → [Comp[], Comp[]]  |
| `PID\|1\|~\|`   | Field → [Rep[], Rep[]]          |
| `PID\|1\|ABC\|` | Field → Rep → Comp → Sub("ABC") |

## Part of Glion

`@glion/parser` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

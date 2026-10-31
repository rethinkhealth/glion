# @glion/to-hl7v2

Compile HL7v2 ASTs back to HL7v2 text — as a `unified` plugin or a standalone helper for any node in the tree.

## What it does

`@glion/to-hl7v2` serializes an HL7v2 AST — typically produced by `@glion/parser` — into the original HL7v2 wire format. Delimiters are read from the Root node's data when present, so a parse-then-serialize round trip writes the message back as it was read (modulo intentional edits to the tree in between), with the line break each segment was read with. The standalone `toHl7v2()` helper works on any subtree, not just the Root, which makes it useful for extracting a single segment, field, or component as text.

## Install

```bash
npm install @glion/to-hl7v2
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";

const msg = `MSH|^~\\&|HIS|RIH|EKG|EKG|200202150930||ADT^A01|MSG00001|P|2.4\rPID|||555-44-4444||DOE^JOHN`;

const file = await unified().use(hl7v2Parser).use(hl7v2ToHl7v2).process(msg);

console.log(String(file));
// MSH|^~\&|HIS|RIH|EKG|EKG|200202150930||ADT^A01|MSG00001|P|2.4
// PID|||555-44-4444||DOE^JOHN
```

## API

### `unified().use(hl7v2ToHl7v2[, options])`

Register the plugin as the compiler of a `unified` processor. Serializes the AST back to HL7v2 text and sets it as the file contents. Reads `file.data.delimiters` when `@glion/annotate-delimiters` set it.

| Option          | Type      | Description                                                                                                                                                                                                       |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encodeEscapes` | `boolean` | Write each subcomponent value with its delimiters, escape character, and control characters as escape sequences (`true`, the default), or as it is (`false`). MSH-1 and MSH-2 are written as they are either way. |

### `toHl7v2(node, delimiters?, options?)`

Standalone serializer. Converts any HL7v2 AST node — `Root`, `Segment`, `Field`, `FieldRepetition`, `Component`, or `Subcomponent` — to its HL7v2 text representation.

- `node` (`Nodes`) — the node to serialize.
- `delimiters` (`Partial<Delimiters>`, optional) — custom delimiter set. When omitted, a `Root` is written with the delimiters its MSH-1 and MSH-2 declare, and any other node with the HL7v2 defaults (`|`, `^`, `~`, `\`, `&`, `\r`).
- `options` (`Hl7v2ToHl7v2Options`, optional) — the options above.

Returns the serialized `string`.

```ts
import { toHl7v2 } from "@glion/to-hl7v2";

toHl7v2(rootNode); // "MSH|^~\&|...\rPID|...\r"
toHl7v2(segmentNode); // "PID|12345|DOE^JOHN"
toHl7v2(fieldNode); // "DOE^JOHN"
toHl7v2(componentNode); // "SUB1&SUB2"
toHl7v2(fieldNode); // "DOE\\T\\SMITH" for the value "DOE&SMITH"
```

### Escape sequences

Each subcomponent value is written as it must appear on the wire: the field, component, repetition, subcomponent, and escape delimiters as `\F\`, `\S\`, `\R\`, `\T\`, and `\E\`, the segment terminator, `\r`, as `\.br\`, and any other character below U+0020 as `\Xdd\`. A character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, is written as `\Xdd\`, the hexadecimal escape of its UTF-8 bytes. A value holding a character that no escape sequence can write with the message's delimiters throws `EscapeSequenceError`, which `@glion/to-hl7v2` exports. A formatting command such as `\H\`, `\N\`, or `\.sp 2\`, a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`) are written as they are. MSH-1 and MSH-2 are written as they are. `encodeEscapes: false` writes every value as it is.

## Round-trip guarantees

- **Segment terminator** — every segment of a `Root` or `Group` is written followed by its `terminator`, so a message is written back with the line breaks it was read with, a last segment with nothing after it included. A last segment with an empty `terminator` is written with nothing after it. Any other segment with an empty `terminator` throws `SegmentTerminatorError`, which `@glion/to-hl7v2` exports: written as it is, it would join the next segment. A segment `@glion/builder` makes ends with `\r`: `MSH|^~\&\rPID|1\r`. To write every segment with `\r`, apply `@glion/transform-segment-terminator` first. A `Segment` on its own is written without one.
- **Delimiter preservation** — the delimiters MSH-1 and MSH-2 declare, or `file.data.delimiters`, carry through to the output. Messages that do not use the defaults round-trip correctly.
- **Escape sequences** — a value `@glion/parser` decoded is written with its escape sequences again, so a message with `\F\`, `\S\`, `\R\`, `\T\`, `\E\`, or `\.br\` in a value reads and writes back as the same text. When a delimiter is the escape code of one of these, that sequence is written back as `\Xdd\`, which reads back as the same value. A `\Xdd\` is written back as the character it decoded to, or as `\.br\` or `\Xdd\` when that character is a control character.
- **MSH handling** — the special case where `MSH-1` is the field separator and `MSH-2` carries the encoding characters is encoded correctly on serialization.
- **Empty fields and components** — preserved in position so field indexes remain stable. Every field is written with its field delimiter, the empty fields at the end of a segment included: a segment read as `PID|1||` is written as `PID|1||`.
- **Every node type supported** — serializing a partial subtree produces the exact fragment you would expect to find embedded inside the full message.

Pair with `@glion/parser` to read HL7v2 in and `@glion/to-hl7v2` to write it back out. A tree parsed with `decodeEscapes: false` is written with `encodeEscapes: false`.

## Part of Glion

`@glion/to-hl7v2` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

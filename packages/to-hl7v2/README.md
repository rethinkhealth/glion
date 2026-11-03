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

Register the plugin as the compiler of a `unified` processor. Serializes the AST back to HL7v2 text and sets it as the file contents. Writes a message with the delimiters its MSH-1 and MSH-2 declare; without a message header segment, with the `delimiters` of the processor's `settings`, or else with `|^~\&`.

| Option          | Type      | Description                                                                                                                                                                                    |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encodeEscapes` | `boolean` | Write each subcomponent value with its separators and control characters as escape sequences (`true`, the default), or as it is (`false`). MSH-1 and MSH-2 are written as they are either way. |

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

Each subcomponent value is written as it must appear on the wire: the field, component, repetition, and subcomponent separators as `\F\`, `\S\`, `\R\`, and `\T\`, and any character below U+0020, such as a carriage return, as `\Xdd\`. A character whose escape code holds a delimiter, such as `|` when `F` is the component separator, is written as `\Xdd\`, the hexadecimal escape of its UTF-8 bytes. A value holding a character that no escape sequence can write with the message's delimiters throws `EscapeSequenceError`, which `@glion/to-hl7v2` exports. Every other character is written as it is, the escape character included: an escape sequence in a value, such as `\E\`, `\H\`, `\.br\`, or `\XC3A9\`, and an escape character that starts no sequence, such as the one in `C:\temp`. An escape character whose closing one, or the end of the value when it has none, comes after a separator or a control character is written `\E\`, so that it does not pair with their escape sequences: `a\b|c` is written `a\E\b\F\c`. A data escape character is written `\E\` in the value, or `\X5C\` when `E` is a delimiter. A carriage return has the one form `\X0D\`, so with `X`, `0`, or both `D` and `d` among the delimiters it throws `EscapeSequenceError`. MSH-1 and MSH-2 are written as they are. `encodeEscapes: false` writes every value as it is.

### Delimiters the message does not declare

A delimiter MSH-2 does not declare is absent: `MSH|^~&` declares the escape character `&` and no subcomponent separator. A value is written with the delimiters the message declares, so with `MSH|^~&`, `a&b` is written as it is. A field of more than one field repetition, a field repetition of more than one component, or a component of more than one subcomponent, with no separator to write them apart, throws `MissingSeparatorError`, whose `separator` is `"repetition"`, `"component"`, or `"subcomponent"`. A value holding a character that must be written as an escape sequence, when the message declares no escape character, throws `MissingEscapeCharacterError`, a subclass of `EscapeSequenceError`. `@glion/to-hl7v2` exports both.

## Round-trip guarantees

- **Segment terminator** — every segment of a `Root` or `Group` is written followed by its `terminator`, so a message is written back with the line breaks it was read with, a last segment with nothing after it included. A last segment with an empty `terminator` is written with nothing after it. Any other segment with an empty `terminator` throws `SegmentTerminatorError`, which `@glion/to-hl7v2` exports: written as it is, it would join the next segment. A segment with no `terminator` throws a `TypeError`. A segment `@glion/builder` makes ends with `\r`: `MSH|^~\&\rPID|1\r`. To write every segment with `\r`, apply `@glion/transform-segment-terminator` first. A `Segment` on its own is written without one.
- **Delimiter preservation** — the delimiters MSH-1 and MSH-2 declare carry through to the output, and a transform that changes MSH-2 changes the delimiters the message is written with. Messages that do not use the defaults round-trip correctly.
- **Escape sequences** — a value `@glion/parser` decoded is written with its escape sequences again, so a message whose values hold no raw character below U+0020 reads and writes back as the same text. `\F\`, `\S\`, `\R\`, `\T\`, and the `\Xdd\` of a control character are written as the code they were read from; every other sequence the parser kept is written as it is. A value keeps the escape sequences it was read with, written with the message's escape character: a node written on its own is written with `DEFAULT_DELIMITERS` unless `delimiters` is passed, so pass the message's delimiters when its escape character is not `\`.
- **MSH handling** — the special case where `MSH-1` is the field separator and `MSH-2` carries the encoding characters is encoded correctly on serialization, for the message header the message opens with. An `MSH` later in a message is written as any other segment.
- **Empty fields and components** — preserved in position so field indexes remain stable. Every field is written with its field separator, the empty fields at the end of a segment included: a segment read as `PID|1||` is written as `PID|1||`.
- **Every node type supported** — serializing a partial subtree produces the exact fragment you would expect to find embedded inside the full message.

Pair with `@glion/parser` to read HL7v2 in and `@glion/to-hl7v2` to write it back out. A tree parsed with `decodeEscapes: false` is written with `encodeEscapes: false`.

## Part of Glion

`@glion/to-hl7v2` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

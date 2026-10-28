# @glion/lint-segment-terminator

> Warn when a segment does not end with a carriage return.

|                      |                                         |
| -------------------- | --------------------------------------- |
| **Recommended**      | ❌                                      |
| **Profile-aware**    | ❌                                      |
| **Default severity** | `warning`                               |
| **Requires**         | `@glion/parser`                         |
| **Since**            | `@glion/lint-segment-terminator@0.31.0` |

## What it does

HL7v2 ends every segment with a carriage return (`\r`, hex `0D`), the last segment of a message included. `@glion/parser` also reads a line feed (`\n`) or a carriage return and a line feed (`\r\n`) as the end of a segment, and reads a message whose last segment has no terminator, so a message that deviates parses like any other; it records what ended each segment in the segment's `terminator`. This rule reports each segment that ends with a line feed, or with a carriage return and a line feed, and a last segment with no segment terminator, as a warning in `file.messages`.

## Install

```bash
npm install @glion/lint-segment-terminator
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintSegmentTerminator from "@glion/lint-segment-terminator";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const processor = unified().use(hl7v2Parser).use(hl7v2LintSegmentTerminator);
const file = new VFile("MSH|^~\\&|SENDER|FAC\r\nPID|1||12345");

await processor.run(processor.parse(file), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintSegmentTerminator)`

A `unified` lint rule plugin. Visits every `segment` node, segments inside a segment group included, reads its `terminator`, and reports one message per segment that does not end with a carriage return. A segment without a `terminator` was not read from text and is not checked.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintSegmentTerminator: Plugin<[], Root>;
export default hl7v2LintSegmentTerminator;
```

## What it checks

Every segment ends with one carriage return. An empty line after a segment's carriage return is not reported.

In these examples, `\r` and `\r\n` stand for the line break that ends each line.

### Valid

Every segment, the last one included, ends with `\r`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r
PID|1||12345\r
```

### Invalid

`MSH` ends with `\r\n`, and `PID`, the last segment, has no segment terminator:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r\n
PID|1||12345
```

Reported messages:

```
The segment ends with a carriage return and a line feed.
The segment has no segment terminator.
```

A segment that ends with `\n` is reported as `The segment ends with a line feed.`, and one that ends with a segment delimiter set to another character in the parser settings as `The segment ends with a character other than a carriage return.` Each message's `note` is `HL7v2 ends every segment with a carriage return, the last one included.`, its `expected` is `["\r"]`, and its `actual` is the character or characters the segment ends with, when it has a terminator. A terminator is reported from the segment's last character to the start of the next line; a missing terminator is reported at the segment's last character.

## When not to use it

A message read from a file saved on a system whose line breaks are `\n` or `\r\n` reports every segment. When such files are the input and the messages are written back after `@glion/transform-segment-terminator`, which ends every segment with `\r`, the rule reports nothing the output keeps.

## Part of Glion

`@glion/lint-segment-terminator` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

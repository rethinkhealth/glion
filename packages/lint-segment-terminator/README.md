# @glion/lint-segment-terminator

> Warn when a segment does not end with a carriage return.

|                      |                                         |
| -------------------- | --------------------------------------- |
| **Recommended**      | ❌                                      |
| **Profile-aware**    | ❌                                      |
| **Default severity** | `warning`                               |
| **Requires**         | `@glion/parser`                         |
| **Since**            | `@glion/lint-segment-terminator@0.32.0` |

## What it does

HL7v2 ends every segment with a carriage return, `\r`, the last segment of a message included. A message saved to a file often ends its segments with `\r\n` or `\n` instead, or has nothing after its last segment. `@glion/parser` reads such a message and records what ended each segment in the segment's `terminator`. This rule reports each segment that does not end with `\r`, as a warning in `file.messages`.

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

A `unified` lint rule plugin. Visits every `segment` node, segments inside a segment group included, and reports one message per segment whose `terminator` is not `\r`. A segment with an empty or absent `terminator` is reported as having no segment terminator.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintSegmentTerminator: Plugin<[], Root>;
export default hl7v2LintSegmentTerminator;
```

## What it checks

Every segment ends with a carriage return. An empty line after it, as in `PID|1\r\r`, is not reported.

| The segment ends with                                       | Reported message                                                  | `actual`    |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ----------- |
| `\r\n`                                                      | `The segment ends with a carriage return and a line feed.`        | `"\r\n"`    |
| `\n`                                                        | `The segment ends with a line feed.`                              | `"\n"`      |
| Nothing                                                     | `The segment has no segment terminator.`                          | `undefined` |
| A segment delimiter set in the parser settings, such as `$` | `The segment ends with a character other than a carriage return.` | `"$"`       |

Every message has the `expected` value `["\r"]` and the `note` `HL7v2 ends every segment with a carriage return, the last one included.` A message about a segment terminator is placed from the segment's last character to the start of the next line; a message about a segment with no segment terminator is placed at the segment's last character.

The examples below are JavaScript strings, so that each line break shows as it is written.

### Valid

Every segment, the last one included, ends with `\r`:

```ts
"MSH|^~\\&\rPID|1\r";
```

### Invalid

`MSH` ends with `\r\n`, `PV1` with `\n`, and `OBX`, the last segment, has nothing after it:

```ts
"MSH|^~\\&\r\nPID|1\rPV1|1\nOBX|1";
```

Reported messages:

```text
The segment ends with a carriage return and a line feed.
The segment ends with a line feed.
The segment has no segment terminator.
```

## When not to use it

When the input is files saved with `\n` or `\r\n` line breaks, the rule reports every segment of every message. A pipeline that reads such files and writes each segment back with `\r` has no use for those reports.

## Part of Glion

`@glion/lint-segment-terminator` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

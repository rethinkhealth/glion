# @glion/lint-segment-terminator

Lint rule that reports HL7v2 segments that don't end with a carriage return.

## What it does

HL7v2 ends every segment with a carriage return (`\r`). Files often use `\n` or `\r\n` instead, and a strict receiver may reject them. This rule reports each segment that doesn't end with `\r`, so the message can be fixed before it is sent.

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

const processor = unified().use(hl7v2Parser).use(hl7v2LintSegmentTerminator);
const file = new VFile("MSH|^~\\&\r\nPID|1\r");

await processor.run(processor.parse(file), file);

file.messages[0]?.message;
// "The segment ends with a carriage return and a line feed."
```

## API

### `unified().use(hl7v2LintSegmentTerminator)`

Reports each segment whose `terminator` is not `\r`. Takes no options.

## What it checks

| The segment ends with | Reported message                                                  |
| --------------------- | ----------------------------------------------------------------- |
| `\r\n`                | `The segment ends with a carriage return and a line feed.`        |
| `\n`                  | `The segment ends with a line feed.`                              |
| Nothing               | `The segment has no segment terminator.`                          |
| Any other character   | `The segment ends with a character other than a carriage return.` |

Each message sets `actual` to what the segment ends with and `expected` to `["\r"]`.

### Valid

```ts
"MSH|^~\\&\rPID|1\r";
```

### Invalid

```ts
"MSH|^~\\&\r\nPID|1\nPV1|1";
```

```text
The segment ends with a carriage return and a line feed.
The segment ends with a line feed.
The segment has no segment terminator.
```

## Part of Glion

`@glion/lint-segment-terminator` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

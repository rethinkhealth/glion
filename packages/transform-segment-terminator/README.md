# @glion/transform-segment-terminator

Unified plugin that ends every HL7v2 segment with the segment terminator, a carriage return.

## What it does

HL7v2 ends every segment with a carriage return (`\r`), the last segment of a message included. `@glion/parser` also reads a segment that ends with a line feed (`\n`), or with a carriage return and a line feed (`\r\n`), and a last segment with nothing after it, and records what ended each segment in its `terminator`. `@glion/to-hl7v2` writes each segment with its `terminator`, so a message is written back with the line breaks it was read with. This plugin sets every segment's `terminator` to `\r`, so the message is written with the segment terminator HL7v2 requires.

## Install

```bash
npm install @glion/transform-segment-terminator
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { hl7v2TransformSegmentTerminator } from "@glion/transform-segment-terminator";
import { unified } from "unified";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2TransformSegmentTerminator)
  .use(hl7v2ToHl7v2)
  .process("MSH|^~\\&|APP\nPID|1\r\nPV1|1");

console.log(JSON.stringify(String(file)));
// "MSH|^~\\&|APP\rPID|1\rPV1|1\r"
```

## API

### `unified().use(hl7v2TransformSegmentTerminator)`

A `unified` transform plugin. Also the package's default export.

Sets the `terminator` of every segment, segments inside groups included, to `\r`. The tree is changed in place.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2TransformSegmentTerminator: Plugin<[], Root>;
export default hl7v2TransformSegmentTerminator;
```

## Part of Glion

`@glion/transform-segment-terminator` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

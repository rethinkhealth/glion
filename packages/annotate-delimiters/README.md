# @glion/annotate-delimiters

Unified plugin to annotate file.data with HL7v2 delimiters derived from MSH-1/MSH-2.

## What it does

HL7v2 messages encode their own delimiters in the first two fields of the MSH segment: MSH-1 carries the field separator and MSH-2 carries the component, repetition, escape, and subcomponent characters. This plugin reads those characters from the parsed tree once and stores the resolved `Delimiters` record on `file.data.delimiters` so downstream plugins (serializers, escape encoders, profile lints) can consult a single source of truth.

## Install

```bash
npm install @glion/annotate-delimiters
```

## Use

```ts
import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

const processor = unified().use(hl7v2Parser).use(hl7v2AnnotateDelimiters);

const file = await processor.process(
  "MSH|^~\\&|SENDER||RECEIVER||20241201||ADT^A01|MSG123|P|2.5\rPID|1||12345"
);

// file.data.delimiters === {
//   field: "|", component: "^", repetition: "~",
//   escape: "\\", subcomponent: "&"
// }
```

## API

This package exports the named constant `hl7v2AnnotateDelimiters`. It is a `unified` plugin with no options:

```ts
import type { Root } from "@glion/ast";
import type { Plugin } from "unified";

export const hl7v2AnnotateDelimiters: Plugin<[], Root, Root>;
```

The plugin expects a parsed `Root` tree and a `VFile`. It never mutates the tree; it only writes to `file.data.delimiters`.

## What it annotates

This plugin writes to `file.data`, not to AST nodes. It derives the six HL7v2 delimiter characters from the first MSH segment and falls back to the default delimiter set when MSH-1 or MSH-2 is absent.

### `file.data.delimiters`

After this plugin runs, the vfile carries:

```ts
interface Delimiters {
  field: string; // MSH-1, e.g. "|"
  component: string; // MSH-2[0], e.g. "^"
  repetition: string; // MSH-2[1], e.g. "~"
  escape: string; // MSH-2[2], e.g. "\\"
  subcomponent: string; // MSH-2[3], e.g. "&"
  segment: string; // segment terminator, e.g. "\r"
}

// Augmented on VFile's DataMap:
// declare module "vfile" {
//   interface DataMap {
//     delimiters: Delimiters;
//   }
// }
```

Resolution is delegated to the `delimiters()` helper in `@glion/util-query`, which walks the tree to find MSH, reads its first two fields, and merges any missing characters with `DEFAULT_DELIMITERS` from `@glion/utils`. Messages with no MSH segment receive the full default set.

## Part of Glion

`@glion/annotate-delimiters` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

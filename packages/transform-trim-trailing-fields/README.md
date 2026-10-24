# @glion/transform-trim-trailing-fields

Unified plugin that removes the empty fields at the end of each HL7v2 segment.

## What it does

A segment can end with empty fields, such as the ones after `DOE` in `PID|1|DOE||`. HL7v2 lets a sender leave out the delimiters after a segment's last field with a value. This plugin removes those empty fields from the tree, so `@glion/to-hl7v2` writes the segment as `PID|1|DOE`.

## Install

```bash
npm install @glion/transform-trim-trailing-fields
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { hl7v2TransformTrimTrailingFields } from "@glion/transform-trim-trailing-fields";
import { unified } from "unified";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2TransformTrimTrailingFields)
  .use(hl7v2ToHl7v2)
  .process("MSH|^~\\&|APP||\rPID|1|DOE|||");

console.log(String(file));
// MSH|^~\&|APP
// PID|1|DOE
```

## Options

| Option              | Type      | Default | Description                                                                                                                            |
| ------------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `keepTrailingField` | `boolean` | `false` | Keep one empty field at the end of a segment that ends with empty fields, so the segment is written with one trailing field separator. |

```ts
unified()
  .use(hl7v2Parser)
  .use(hl7v2TransformTrimTrailingFields, { keepTrailingField: true })
  .use(hl7v2ToHl7v2)
  .process("PID|1|DOE|||");
// PID|1|DOE|
```

## API

### `unified().use(hl7v2TransformTrimTrailingFields[, options])`

A `unified` transform plugin. Also the package's default export.

Visits every segment, including segments inside groups, and removes the empty fields after its last field that is not empty, or all of them but one with `keepTrailingField`. The empty fields before that field stay in place, so field positions do not change. A segment that ends with a field with a value is left as it is.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

interface TransformTrimTrailingFieldsOptions {
  keepTrailingField?: boolean;
}

declare const hl7v2TransformTrimTrailingFields: Plugin<
  [TransformTrimTrailingFieldsOptions?],
  Root
>;
export default hl7v2TransformTrimTrailingFields;
```

## Empty fields

A field is empty when none of its components, repetitions, or subcomponents holds a value. HL7v2 treats such a field as not present: `|ABC^DEF^^|` and `|ABC^DEF|` are equivalent, and a sender need not include delimiters after the last field present.

| Segment          | Written back as | Why                                                 |
| ---------------- | --------------- | --------------------------------------------------- |
| `PID\|1\|\|`     | `PID\|1`        | The last two fields are empty.                      |
| `PID\|\|\|`      | `PID`           | Every field is empty.                               |
| `PID\|1\|^^\|`   | `PID\|1`        | No component of the last two fields holds a value.  |
| `PID\|1\|^DEF\|` | `PID\|1\|^DEF`  | The second component of PID-2 holds `DEF`.          |
| `PID\|1\|""\|`   | `PID\|1\|""`    | `""` is the HL7v2 null value, so the field is kept. |

## Part of Glion

`@glion/transform-trim-trailing-fields` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

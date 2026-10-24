# @glion/lint-no-trailing-empty-field

Lint rule that flags HL7v2 segments ending with one or more empty trailing fields.

## What it does

For each segment, finds its last field that is not empty and reports a warning when two or more empty fields follow it, or one with `strict: true`. A field is empty when none of its components, repetitions, or subcomponents holds a value. Trailing empty fields come from field separators (`|`) at the end of a segment; some strict receivers reject such segments, and downstream tools may misinterpret the empty positions.

## Install

```bash
npm install @glion/lint-no-trailing-empty-field
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintNoTrailingEmptyField from "@glion/lint-no-trailing-empty-field";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintNoTrailingEmptyField)
  .process(message);

console.error(reporter([file]));
```

## Options

| Option   | Type      | Default | Description                                                                                  |
| -------- | --------- | ------- | -------------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `false` | Report a segment that ends with one empty field, such as `PID\|1\|`, as well as two or more. |

```ts
unified().use(hl7v2LintNoTrailingEmptyField, { strict: true });
```

## API

### `unified().use(hl7v2LintNoTrailingEmptyField[, options])`

A `unified` lint rule plugin.

Visits every `segment` node, scans its `field` children from the end, and reports one message per segment that has trailing empty fields. The reported position spans the first trailing empty field to the end of the segment.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

interface NoTrailingEmptyFieldOptions {
  strict?: boolean;
}

declare const hl7v2LintNoTrailingEmptyField: Plugin<
  [NoTrailingEmptyFieldOptions?],
  Root
>;
export default hl7v2LintNoTrailingEmptyField;
```

## What it checks

A segment ends at its last field that is not empty, or one field after it unless `strict` is set. A field is empty when none of its components, repetitions, or subcomponents holds a value: `||`, `|^^|`, and `|~|` are empty, while `|^DEF|` and `|""|`, the HL7v2 null value, are not.

### Valid

`PID` ends with a populated field (`F`):

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

`PID` ends with one empty field after `F`, which is reported only with `strict: true`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F|
```

### Invalid

`PID` has two trailing empty fields after the sex component:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F||
```

Reported message:

```
The segment has 2 trailing field separators.
```

The message counts the field separators after the last field with a value. Its `note` is `HL7v2 does not require field separators after the last field with a value.` One message is reported per offending segment, whatever its Segment ID.

## Part of Glion

`@glion/lint-no-trailing-empty-field` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

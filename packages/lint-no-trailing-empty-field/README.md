# @glion/lint-no-trailing-empty-field

Lint rule that flags HL7v2 segments ending with one or more empty trailing fields.

## What it does

For each segment, finds the index of the last non-empty field and reports a warning if any empty fields appear after it. Trailing empty fields come from stray field separators (`|`) at the end of a segment and should be stripped — some strict receivers reject such segments, and downstream tools may misinterpret the empty positions.

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

## API

### `unified().use(hl7v2LintNoTrailingEmptyField)`

A `unified` lint rule plugin. Takes no options.

Visits every `segment` node, scans its `field` children from the end, and reports one message per segment that has trailing empty fields. The reported position spans the first empty field to the end of the segment (including the separator after the last empty field).

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintNoTrailingEmptyField: Plugin<[], Root>;
export default hl7v2LintNoTrailingEmptyField;
```

## What it checks

A segment's last field must be non-empty. Any empty fields after the last populated field are trailing and therefore flagged.

### Valid

`PID` ends with a populated field (`F`):

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID` has two trailing empty fields after the sex component:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F||
```

Reported message:

```
Segment `PID` ends with 2 empty fields; a segment should end at its last field with a value.
```

A segment with an empty Segment ID is reported as `A segment with an empty Segment ID ends with 2 empty fields; …`. One message is reported per offending segment.

## Part of Glion

`@glion/lint-no-trailing-empty-field` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

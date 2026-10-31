# @glion/lint-profile-field-repetition

Lint rule that reports a field with more repetitions than HL7v2 allows.

## What it does

Flags a field with more repetitions (separated by `~`) than the HL7v2 standard for the message's version allows: one for a field that does not repeat, or a set number such as 2 for `OBR-17` in v2.6. Fields with no limit on repetitions are never reported. It needs the plugins `@glion/annotate-profile-context` and `@glion/annotate-profile-fields` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-field-repetition
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintFieldRepetition from "@glion/lint-profile-field-repetition";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101~19800102|F\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2LintFieldRepetition)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintFieldRepetition)`

A `unified` lint rule plugin. Takes no options. Reports one message for each field with too many repetitions.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintFieldRepetition: Plugin<[], Root>;
export default hl7v2LintFieldRepetition;
```

## What it checks

A field has at most as many repetitions as its repetition limit in the message's version. For example, `PID-7` (Date/Time of Birth) does not repeat in v2.5.

### Valid

`PID-7` has one value:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-7` has two values:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101~19800102|F
```

Reported message:

```
The field has 2 repetitions; it allows at most 1 repetition.
```

## Part of Glion

`@glion/lint-profile-field-repetition` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

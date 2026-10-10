# @glion/lint-profile-field-repetition

Lint rule that flags non-repeatable fields with multiple repetitions.

## What it does

Flags fields that contain more than one repetition (delimited by `~`) when the HL7v2 profile for the message's version gives that field `repetitions: 1`. The rule reads profile context attached by `@glion/annotate-profile-context`. A single repetition is always valid; only 2+ repetitions on a non-repeatable field are reported. Segments without a known profile are silently skipped.

## Install

```bash
npm install @glion/lint-profile-field-repetition
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintFieldRepetition from "@glion/lint-profile-field-repetition";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintFieldRepetition)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintFieldRepetition)`

A `unified` lint rule plugin. Takes no options.

Reads `file.data.profile`. For each field under a segment with a known profile it looks up the field entry by sequence. If the field's profile sets `repetitions: 1` and the AST has more than one repetition, the rule emits one message for that field.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintFieldRepetition: Plugin<[], Root>;
export default hl7v2LintFieldRepetition;
```

## What it checks

This rule flags fields with multiple `~`-delimited repetitions when the profile marks the field as non-repeatable. For example, `PID-7` (Date of Birth) is not repeatable in v2.5.

### Valid

`PID-7` carries a single Date of Birth:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-7` carries two `~`-separated values, which violates the v2.5 profile for the `PID-7` field:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101~19800102|F
```

Reported message:

```
Field PID-7 (Date/Time of Birth) is not repeatable but has 2 repetitions
```

When the field name is available in the profile it appears in parentheses after the position. The reported count equals the number of repetitions present in the field.

## Part of Glion

`@glion/lint-profile-field-repetition` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

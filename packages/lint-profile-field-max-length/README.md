# @glion/lint-profile-field-max-length

Lint rule to validate field value lengths against HL7v2 profile maxLength.

## What it does

Flags field values that exceed the `maxLength` declared in the HL7v2 profile for the message's version. Length is computed by recursively summing the string lengths of all subcomponent values in a repetition, so delimiters (`^`, `&`, `~`) are not counted. The rule reads profile context attached by `@glion/annotate-profile-context` and reports once per offending repetition. Fields without a declared `maxLength`, empty fields, and Z-segments are skipped.

## Install

```bash
npm install @glion/lint-profile-field-max-length
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintFieldMaxLength from "@glion/lint-profile-field-max-length";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintFieldMaxLength)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintFieldMaxLength)`

A `unified` lint rule plugin. Takes no options.

Reads `file.data.profile`. For each segment in the tree it walks its fields, looks up the profile entry by sequence, and — if a `maxLength` is declared — compares it against `getLength()` from `@glion/utils` for every repetition. Each repetition over the limit produces one message.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintFieldMaxLength: Plugin<[], Root>;
export default hl7v2LintFieldMaxLength;
```

## What it checks

This rule flags fields whose measured content length is greater than the `maxLength` declared for that field in the HL7v2 profile. In v2.5, `MSH-10` (Message Control ID) has `maxLength: 20`.

### Valid

`MSH-10` carries a 9-character Message Control ID, well within the v2.5 limit of 20:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`MSH-10` is 28 characters long, exceeding the v2.5 limit of 20:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG0000000000000000000000001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
Field `MSH-10` (Message Control ID) is 28 characters long; it allows at most 20 characters.
```

One message is produced per offending repetition, with `actual` set to the measured length. Delimiters are not included in the measured length — a composite value like `DOE^JANE` counts as 7 characters, not 8.

## Part of Glion

`@glion/lint-profile-field-max-length` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

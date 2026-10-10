# @glion/lint-profile-required-fields

Lint rule to validate required fields per HL7v2 profile.

## What it does

Flags segments whose required fields (as declared by the HL7v2 profile for the message's version) are missing or empty. The rule reads profile context attached to the file by `@glion/annotate-profile-context` and reports one message per missing required field. Segments without a known profile (for example Z-segments like `ZPD`) are silently skipped.

## Install

```bash
npm install @glion/lint-profile-required-fields
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintRequiredFields from "@glion/lint-profile-required-fields";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintRequiredFields)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintRequiredFields)`

A `unified` lint rule plugin. Takes no options.

The plugin reads `file.data.profile` (populated by `@glion/annotate-profile-context`). If no profile context is present the rule exits silently. For each segment, it iterates `fieldDef.requiredSequences` and checks that the corresponding field at that 1-based position is present and non-empty.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintRequiredFields: Plugin<[], Root>;
export default hl7v2LintRequiredFields;
```

## What it checks

This rule flags fields whose optionality is `R` in the HL7v2 profile for the message's version when those fields are missing or empty on the corresponding segment.

### Valid

`PID-3` (Patient Identifier List) and `PID-5` (Patient Name) are required in v2.5 and both are populated:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-3` is empty, which violates the v2.5 profile for the `PID` segment:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||||DOE^JANE||19800101|F
```

Reported message:

```
Required field PID-3 (Patient Identifier List) is missing or empty
```

When the profile attaches a field name, it appears in parentheses after the position. Segments shorter than the highest required sequence produce one message per missing required field.

## Part of Glion

`@glion/lint-profile-required-fields` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

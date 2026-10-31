# @glion/lint-profile-field-max-length

Lint rule that reports a field value longer than HL7v2 allows.

## What it does

Flags a field value longer than the maximum length the HL7v2 standard gives that field in the message's version. Each repetition of a field is measured on its own, and delimiters (`^`, `&`) are not counted. It needs the plugins `@glion/annotate-profile-context` and `@glion/annotate-profile-fields` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-field-max-length
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintFieldMaxLength from "@glion/lint-profile-field-max-length";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG0000000000000000000000001|P|2.5\r",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2LintFieldMaxLength)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintFieldMaxLength)`

A `unified` lint rule plugin. Takes no options. Reports one message for each field repetition over the limit.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintFieldMaxLength: Plugin<[], Root>;
export default hl7v2LintFieldMaxLength;
```

## What it checks

Each repetition of a field is at most as long as the field's maximum length in the message's version. For example, `MSH-10` (Message Control ID) allows 20 characters in v2.5.

### Valid

`MSH-10` has 8 characters:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`MSH-10` has 28 characters:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG0000000000000000000000001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
The value is 28 characters long; the field allows at most 20 characters.
```

A composite value such as `DOE^JANE` counts as 7 characters, not 8.

## Part of Glion

`@glion/lint-profile-field-max-length` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

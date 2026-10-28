# @glion/lint-profile-required-fields

Lint rule that reports a required field that is missing or empty.

## What it does

Flags a field that the HL7v2 standard for the message's version marks `R` (required) when it is missing or empty. Segments the standard does not define, such as Z-segments, are skipped. It needs the plugin `@glion/annotate-profile-context` to run before it; `@glion/preset-lint-profile-recommended` includes it.

## Install

```bash
npm install @glion/lint-profile-required-fields
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import hl7v2LintRequiredFields from "@glion/lint-profile-required-fields";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
  "PID|1||||DOE^JANE||19800101|F\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintRequiredFields)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintRequiredFields)`

A `unified` lint rule plugin. Takes no options. Reports one message for each required field that is missing or empty.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintRequiredFields: Plugin<[], Root>;
export default hl7v2LintRequiredFields;
```

## What it checks

Every field marked `R` in the message's version is present and not empty. For example, in v2.5 `PID-3` (Patient Identifier List) and `PID-5` (Patient Name) are required.

### Valid

`PID-3` and `PID-5` both have values:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-3` is empty:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||||DOE^JANE||19800101|F
```

Reported message:

```
The field is empty; it is required.
```

A segment that ends before a required field, such as `PID|1`, produces one message per required field it does not reach:

```
Field `PID-3` (Patient Identifier List) is not present; it is required.
Field `PID-5` (Patient Name) is not present; it is required.
```

## Part of Glion

`@glion/lint-profile-required-fields` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

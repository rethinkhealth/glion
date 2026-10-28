# @glion/lint-profile-backward-compatible

Lint rule that reports a value in an element HL7v2 keeps only for backward compatibility.

## What it does

Flags a field, component, or subcomponent that has a value although the HL7v2 standard for the message's version marks it `B` (backward compatible). HL7v2 keeps such an element so older systems can still send it, and another element now carries its data. A value is still allowed, so `@glion/preset-lint-profile-recommended` reports it as a warning. It needs the plugins `@glion/annotate-profile-context`, `@glion/annotate-profile-fields` and `@glion/annotate-profile-datatypes` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-backward-compatible
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintBackwardCompatible from "@glion/lint-profile-backward-compatible";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5.1\r",
  "DG1|1|I9|250.00|DIABETES\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileDatatypes)
  .use(hl7v2LintBackwardCompatible)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintBackwardCompatible)`

A `unified` lint rule plugin. Takes no options. Reports one message for each backward-compatible element that has a value.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintBackwardCompatible: Plugin<[], Root>;
export default hl7v2LintBackwardCompatible;
```

## What it checks

An element whose optionality is `B` in the message's version should be empty. The explicit null `""` is accepted. For example, in v2.5.1 the field `DG1-4` (Diagnosis Description) is backward compatible, and `DG1-3` (Diagnosis Code) carries the diagnosis.

### Valid

`DG1-4` is empty in a v2.5.1 message:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5.1
DG1|1|I9|250.00
```

### Invalid

`DG1-4` has a value in a v2.5.1 message:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5.1
DG1|1|I9|250.00|DIABETES
```

Reported message:

```
The data element has a value; v2.5.1 keeps it only for backward compatibility.
```

A field is reported once, whichever of its repetitions has a value. A component is reported in each repetition that gives it a value.

## Part of Glion

`@glion/lint-profile-backward-compatible` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

# @glion/lint-profile-withdrawn

Lint rule that reports a value in an element HL7v2 has withdrawn.

## What it does

Flags a field, component, or subcomponent that has a value although the HL7v2 standard for the message's version marks it `W` (withdrawn). A withdrawn element keeps its position, so the elements after it keep their numbers, but it must be left empty. It needs the plugins `@glion/annotate-profile-context`, `@glion/annotate-profile-fields` and `@glion/annotate-profile-datatypes` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-withdrawn
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintWithdrawn from "@glion/lint-profile-withdrawn";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.7\r",
  "AL1|1||PENICILLIN|||20240101\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileDatatypes)
  .use(hl7v2LintWithdrawn)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintWithdrawn)`

A `unified` lint rule plugin. Takes no options. Reports one message for each withdrawn element that has a value.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintWithdrawn: Plugin<[], Root>;
export default hl7v2LintWithdrawn;
```

## What it checks

An element whose optionality is `W` in the message's version must be empty. The explicit null `""` is accepted. HL7v2 withdraws elements from v2.6 on: for example the field `AL1-6` (Identification Date) and the component `XPN.6` (Degree) in v2.7.

### Valid

`AL1-6` is empty in a v2.7 message:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.7
AL1|1||PENICILLIN
```

### Invalid

`AL1-6` has a value in a v2.7 message:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.7
AL1|1||PENICILLIN|||20240101
```

Reported message:

```
The data element has a value; it is withdrawn in v2.7 and must be empty.
```

A field is reported once, whichever of its repetitions has a value. A component is reported in each repetition that gives it a value.

## Part of Glion

`@glion/lint-profile-withdrawn` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

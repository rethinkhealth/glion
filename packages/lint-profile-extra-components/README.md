# @glion/lint-profile-extra-components

Lint rule to warn when a composite field contains more components than its datatype profile defines.

## What it does

Flags a field repetition with more components than its datatype defines in the message's version. A primitive datatype defines one component. Empty fields, fields on unknown segments, and fields with no datatype are skipped. It needs the plugins `@glion/annotate-profile-context` and `@glion/annotate-profile-fields` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-extra-components
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintExtraComponents from "@glion/lint-profile-extra-components";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F\r",
].join("");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2LintExtraComponents)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintExtraComponents)`

A `unified` lint rule plugin. Takes no options. Reports one message for each repetition with too many components, with the number of components in `actual`.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintExtraComponents: Plugin<[], Root>;
export default hl7v2LintExtraComponents;
```

## What it checks

A field repetition has at most as many components as its datatype defines. `PID-8` (Administrative Sex) is a primitive field in v2.5, so it allows one component.

### Valid

`PID-8` has a single component (`F`), which matches the primitive limit:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-8` has two components (`F^EXTRA`), which exceeds the v2.5 primitive limit of 1:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F^EXTRA
```

Reported message:

```
The field repetition has 2 components; its datatype allows at most 1 component.
```

The limit comes from the field's datatype in the message's version. `PID-3` is a `CX` field, which defines 10 components in v2.5, so a repetition with 11 is reported as:

```
The field repetition has 11 components; its datatype allows at most 10 components.
```

## Part of Glion

`@glion/lint-profile-extra-components` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

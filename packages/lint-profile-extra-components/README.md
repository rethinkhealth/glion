# @glion/lint-profile-extra-components

Lint rule to warn when a composite field contains more components than its datatype profile defines.

## What it does

Flags fields whose repetitions contain more components than the datatype's profile allows. For composite datatypes, the maximum is the highest sequence key in the datatype definition; for primitive datatypes the maximum is 1 (the value itself). The rule reads profile context attached by `@glion/annotate-profile-context`. Empty fields, fields on unknown segments, and fields whose datatype definition is missing are silently skipped.

## Install

```bash
npm install @glion/lint-profile-extra-components
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintExtraComponents from "@glion/lint-profile-extra-components";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintExtraComponents)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintExtraComponents)`

A `unified` lint rule plugin. Takes no options.

Reads `file.data.profile`. For each non-empty field it resolves the datatype definition. For primitives the allowed component count is 1; for composites it is the highest key in `dtDef.componentsBySequence`. Every component at a position greater than that max produces one message per offending repetition.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintExtraComponents: Plugin<[], Root>;
export default hl7v2LintExtraComponents;
```

## What it checks

This rule flags `^`-delimited components past the profile's defined range for a datatype. `PID-8` (Administrative Sex) is a primitive field in v2.5, so it allows exactly one component.

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
Component `PID-8.2` is present; datatype `IS` in HL7 v2.5 does not define it.
```

The datatype code (for example `IS`, `CX`, `XPN`) comes from the field's profile. A primitive datatype defines only component 1. A `CX` field in v2.5 defines 10 components, so an 11th is reported as:

```
Component `PID-3.11` is present; datatype `CX` in HL7 v2.5 does not define it.
```

## Part of Glion

`@glion/lint-profile-extra-components` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

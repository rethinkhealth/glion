# @glion/lint-profile-required-components

Lint rule that reports a required component that is missing or empty.

## What it does

Flags a component that the HL7v2 standard for the message's version marks `R` (required) when it is missing or empty in a field that has a value. Before v2.5 the standard marks no component as required, so the rule reports nothing for older versions. Empty fields are left to `@glion/lint-profile-required-fields`. It needs the plugins `@glion/annotate-profile-context` and `@glion/annotate-profile-fields` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-required-components
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintRequiredComponents from "@glion/lint-profile-required-components";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^|MSG00001|P|2.5\r",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2LintRequiredComponents)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintRequiredComponents)`

A `unified` lint rule plugin. Takes no options. Reports one message for each required component that is missing or empty, in each repetition.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintRequiredComponents: Plugin<[], Root>;
export default hl7v2LintRequiredComponents;
```

## What it checks

In a field that has a value, every component marked `R` in the message's version is present and not empty. For example, in v2.5 `MSH-9` (Message Type) requires the message code (`MSH-9.1`), the trigger event (`MSH-9.2`) and the message structure (`MSH-9.3`).

### Valid

`MSH-9` has all three components:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`MSH-9.2` is empty and `MSH-9.3` is missing:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported messages:

```
The component is empty; it is required.
Component `MSH-9.3` (Message Structure) is not present; it is required.
```

## Part of Glion

`@glion/lint-profile-required-components` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

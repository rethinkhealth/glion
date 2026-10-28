# @glion/preset-lint-profile-recommended

Preset bundling every profile-based HL7v2 lint rule for validating messages against their version-specific profiles.

## What it does

One `.use(...)` call checks a message against the HL7v2 standard of its version (MSH-12): required fields and components, field lengths and repetitions, table values, extra fields and components, segment order, and values in withdrawn or backward-compatible elements. The preset includes the profile annotators these rules need, so nothing else has to run first.

## Install

```bash
npm install @glion/preset-lint-profile-recommended
```

## Use

```ts
import { parseHL7v2 } from "@glion/parser";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01|MSG00001|P|2.5\r",
  "PID|1||PATID1234^^^HOSP^MR\r",
].join("");

const file = new VFile();
await unified()
  .use(hl7v2PresetLintProfileRecommended)
  .run(parseHL7v2(message), file);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2PresetLintProfileRecommended)`

The default export is a `unified` preset. Takes no options. A rule's severity can be changed, or the rule turned off, by adding it again after the preset: `.use(hl7v2LintBackwardCompatible, "error")` or `.use(hl7v2LintBackwardCompatible, false)`.

## What's bundled

The preset runs these plugins in order: the annotators first, then the rules.

| Plugin                                                                           | Severity | Purpose                                                                  |
| -------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| [`@glion/annotate-profile-context`](../annotate-profile-context)                 | —        | Loads the HL7v2 profile of the message's version.                        |
| [`@glion/annotate-profile-fields`](../annotate-profile-fields)                   | —        | Annotates each field with its row in the segment attribute table.        |
| [`@glion/annotate-profile-datatypes`](../annotate-profile-datatypes)             | —        | Annotates each component and subcomponent with its row in its datatype.  |
| [`@glion/lint-profile-required-fields`](../lint-profile-required-fields)         | error    | Flags missing or empty required fields.                                  |
| [`@glion/lint-profile-field-max-length`](../lint-profile-field-max-length)       | warning  | Enforces field-value `maxLength` from the profile.                       |
| [`@glion/lint-profile-field-repetition`](../lint-profile-field-repetition)       | error    | Flags fields with more repetitions than HL7v2 allows.                    |
| [`@glion/lint-profile-required-components`](../lint-profile-required-components) | error    | Validates required components inside composite datatypes.                |
| [`@glion/lint-profile-table-values`](../lint-profile-table-values)               | warning  | Validates coded values against HL7 tables.                               |
| [`@glion/lint-profile-timestamps`](../lint-profile-timestamps)                   | warning  | Flags a DT, TM, or DTM value that is not a valid date or time.           |
| [`@glion/lint-profile-extra-fields`](../lint-profile-extra-fields)               | warning  | Warns when a segment contains more fields than the profile defines.      |
| [`@glion/lint-profile-extra-components`](../lint-profile-extra-components)       | warning  | Warns when a composite field contains more components than its datatype. |
| [`@glion/lint-profile-segment-order`](../lint-profile-segment-order)             | error    | Validates segment order against the event schema.                        |
| [`@glion/lint-profile-withdrawn`](../lint-profile-withdrawn)                     | error    | Flags a value in a withdrawn field, component, or subcomponent.          |
| [`@glion/lint-profile-backward-compatible`](../lint-profile-backward-compatible) | warning  | Flags a value in an element kept only for backward compatibility.        |

An error sets `fatal: true` on the message; a warning sets `fatal: false`. Neither throws.

`@glion/preset-lint-recommended` holds the lint rules that do not depend on the version.

## Part of Glion

`@glion/preset-lint-profile-recommended` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

# @glion/preset-lint-profile-recommended

Preset bundling every profile-based HL7v2 lint rule for validating messages against their version-specific profiles.

## What it does

This preset wires the eight profile lint rules plus the `annotate-profile-context` loader into a single `unified` plugin. One `.use(...)` call enables required-field, field-length, field-repetition, required-component, table-value, extra-field, extra-component, and segment-order validation — all driven by the HL7v2 profile loaded for the message's MSH-12 version.

## Install

```bash
npm install @glion/preset-lint-profile-recommended
```

## Use

```ts
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2PresetLintProfileRecommended);

const file = await processor.process(
  "MSH|^~\\&|SENDER||RECEIVER||20250601120000||ADT^A01|MSG00001|P|2.5\rPID|1||PATID1234^^^HOSP^MR"
);

for (const message of file.messages) {
  console.log(`${message.ruleId}: ${message.reason}`);
}
```

## API

### `unified().use(hl7v2PresetLintProfileRecommended)`

Default export is a `Preset` (unified's `{ plugins: [...] }` shape). No options — to configure individual rules, compose them directly from their own packages instead of using the preset.

## What's bundled

The preset applies these plugins in order. `annotate-profile-context` runs first so every subsequent rule sees the resolved profile on `file.data.profile`.

| Plugin                                                                           | Severity | Purpose                                                                  |
| -------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| [`@glion/annotate-profile-context`](../annotate-profile-context)                 | —        | Loads the HL7v2 profile for the message version onto `file.data`.        |
| [`@glion/lint-profile-required-fields`](../lint-profile-required-fields)         | error    | Flags missing or empty required fields.                                  |
| [`@glion/lint-profile-field-max-length`](../lint-profile-field-max-length)       | warning  | Enforces field-value `maxLength` from the profile.                       |
| [`@glion/lint-profile-field-repetition`](../lint-profile-field-repetition)       | error    | Flags non-repeatable fields that contain multiple repetitions.           |
| [`@glion/lint-profile-required-components`](../lint-profile-required-components) | error    | Validates required components inside composite datatypes.                |
| [`@glion/lint-profile-table-values`](../lint-profile-table-values)               | warning  | Validates coded values against HL7 tables.                               |
| [`@glion/lint-profile-extra-fields`](../lint-profile-extra-fields)               | warning  | Warns when a segment contains more fields than the profile defines.      |
| [`@glion/lint-profile-extra-components`](../lint-profile-extra-components)       | warning  | Warns when a composite field contains more components than its datatype. |
| [`@glion/lint-profile-segment-order`](../lint-profile-segment-order)             | error    | Validates segment order against the event schema.                        |

An error sets `fatal: true` on the message; a warning sets `fatal: false`. Neither throws.

The companion `@glion/preset-lint-recommended` covers the core (version-independent) lint rules; use both together for comprehensive validation.

## Part of Glion

`@glion/preset-lint-profile-recommended` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

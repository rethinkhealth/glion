# @glion/preset-lint-recommended

Preset bundling the core (version-independent) HL7v2 lint rules.

## What it does

This preset wires the core HL7v2 lint rules into a single `unified` plugin. One `.use(...)` call enables structural checks that apply to every HL7v2 message regardless of version or profile: segment header shape, message header presence, version range, and trailing field hygiene.

## Install

```bash
npm install @glion/preset-lint-recommended
```

## Use

```ts
import hl7v2PresetLintRecommended from "@glion/preset-lint-recommended";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

const processor = unified().use(hl7v2Parser).use(hl7v2PresetLintRecommended);

const file = await processor.process(
  "MSH|^~\\&|SENDER||RECEIVER||20250601120000||ADT^A01|MSG00001|P|2.5"
);

for (const message of file.messages) {
  console.log(`${message.ruleId}: ${message.reason}`);
}
```

## API

### `unified().use(hl7v2PresetLintRecommended)`

Default export is a `Preset` (unified's `{ plugins: [...] }` shape). No options — to configure individual rules, compose them directly from their own packages instead of using the preset.

## What's bundled

The preset applies these rules in order. Three are configured at `error` severity; `no-trailing-empty-field` uses its default severity.

| Plugin                                                                   | Purpose                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`@glion/lint-segment-header-length`](../lint-segment-header-length)     | Flags segment headers that are not exactly three characters. |
| [`@glion/lint-required-message-header`](../lint-required-message-header) | Flags messages whose first segment is not `MSH`.             |
| [`@glion/lint-message-version`](../lint-message-version)                 | Flags `MSH-12` values outside the configured semver range.   |
| [`@glion/lint-no-trailing-empty-field`](../lint-no-trailing-empty-field) | Flags segments that end with two or more empty fields.       |

The companion `@glion/preset-lint-profile-recommended` covers profile-driven, version-specific lint rules; use both together for comprehensive validation.

## Part of Glion

`@glion/preset-lint-recommended` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

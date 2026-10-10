# @glion/preset-annotate-profile-recommended

Preset bundling every profile-based annotation plugin so the AST carries full profile metadata after a single `.use(...)` call.

## What it does

This preset wires the five profile annotation plugins plus the `annotate-profile-context` loader into a single `unified` plugin. One `.use(...)` call enriches every segment, field, field-repetition, component, sub-component, and coded value in the AST with its HL7v2 profile metadata — names, datatypes, optionality, repetitions, max lengths, table references, and code-system displays. The annotated tree is self-describing and can be walked without loading any profiles yourself.

## Install

```bash
npm install @glion/preset-annotate-profile-recommended
```

## Use

```ts
import hl7v2PresetAnnotateProfileRecommended from "@glion/preset-annotate-profile-recommended";
import { hl7v2Parser } from "@glion/parser";
import { visit } from "@glion/util-visit";
import { unified } from "unified";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2PresetAnnotateProfileRecommended);

const file = await processor.process(
  "MSH|^~\\&|SENDER||RECEIVER||20250601120000||ADT^A01|MSG00001|P|2.5\rPID|1||12345||Doe^John"
);

visit(file.result, "field", (node) => {
  if (node.data?.optionality === "R" && node.data.name) {
    console.log(`Required: ${node.data.id} (${node.data.name})`);
  }
});
```

## API

### `unified().use(hl7v2PresetAnnotateProfileRecommended)`

Default export is a `Preset` (unified's `{ plugins: [...] }` shape). No options — to annotate selectively, compose individual plugins from their own packages instead.

## What's bundled

The preset applies these plugins in order. `annotate-profile-context` runs first so each subsequent plugin reads the pre-resolved profile from `file.data.profile`.

| Plugin                                                                                   | Annotates                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`@glion/annotate-profile-context`](../annotate-profile-context)                         | Loads the HL7v2 profile for the message version onto `file.data`.                                  |
| [`@glion/annotate-profile-segments`](../annotate-profile-segments)                       | Annotates Segment nodes with their human-readable title (e.g. `MSH` → `"Message Header"`).         |
| [`@glion/annotate-profile-fields`](../annotate-profile-fields)                           | Annotates Field nodes with `name`, `optionality`, `repetitions`, `datatype`, `maxLength`, `table`. |
| [`@glion/annotate-profile-datatypes`](../annotate-profile-datatypes)                     | Annotates FieldRepetition, Component, and Subcomponent nodes with datatype metadata.               |
| [`@glion/annotate-profile-fields-code-systems`](../annotate-profile-fields-code-systems) | Annotates coded fields with UTG code-system identity and resolved display values.                  |

All five plugins read the HL7v2 version from `MSH-12` and load profiles via `@glion/profiles`. Unknown segments (Z-segments) are silently skipped so non-standard content passes through unchanged.

## Part of Glion

`@glion/preset-annotate-profile-recommended` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

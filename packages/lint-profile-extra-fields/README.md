# @glion/lint-profile-extra-fields

Lint rule that warns when a segment has more fields than its profile defines.

## What it does

Flags a segment with more fields than the HL7v2 standard defines for it in the message's version. The rule reads profile context attached by `@glion/annotate-profile-context`. Segments without a known profile (for example Z-segments) are skipped.

## Install

```bash
npm install @glion/lint-profile-extra-fields
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintExtraFields from "@glion/lint-profile-extra-fields";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintExtraFields)
  .process(message);

console.error(reporter([file]));
```

## Options

| Option   | Type      | Default | Description                                                                                       |
| -------- | --------- | ------- | ------------------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `false` | Count every field the segment holds, the empty fields after its last field with a value included. |

```ts
unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintExtraFields, { strict: true });
```

## API

### `unified().use(hl7v2LintExtraFields[, options])`

A `unified` lint rule plugin.

Reports one message for each segment with too many fields, with the number of fields in `actual`.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

interface ExtraFieldsOptions {
  strict?: boolean;
}

declare const hl7v2LintExtraFields: Plugin<[ExtraFieldsOptions?], Root>;
export default hl7v2LintExtraFields;
```

## What it checks

A segment has at most as many fields as its profile defines. `MSH` in v2.5 ends at `MSH-21`, so it allows 21 fields. Fields are counted up to the segment's last field with a value; empty fields after it are not counted unless `strict` is set. HL7v2 treats a field with no value as not present, and a sender need not write the delimiters after the last field present.

### Valid

`MSH` stops at `MSH-12` (Version ID) and all fields are within the v2.5 definition:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

`MSH` ends with empty fields up to `MSH-22`, one past the v2.5 definition, and its last field with a value is `MSH-12`. With `strict: true`, it has 22 fields and is reported:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5||||||||||
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`MSH` has 22 fields, one more than v2.5 defines:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5||||||||||EXTRA
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
The segment has 22 fields; it allows at most 21 fields.
```

The version is taken from the annotated profile context. A segment is reported once, however many fields it has past its last.

## Part of Glion

`@glion/lint-profile-extra-fields` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

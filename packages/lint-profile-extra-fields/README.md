# @glion/lint-profile-extra-fields

Lint rule that warns when a segment contains fields beyond the maximum sequence defined in its profile.

## What it does

Flags fields whose sequence number exceeds the highest field position defined in the HL7v2 profile for that segment at the message's version. The rule reads profile context attached by `@glion/annotate-profile-context`, computes the maximum defined sequence per segment, and reports each field past that boundary. Segments without a known profile (for example Z-segments) are silently skipped.

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

## API

### `unified().use(hl7v2LintExtraFields)`

A `unified` lint rule plugin. Takes no options.

Reads `file.data.profile`. For each segment it looks up the field definition set and takes the largest key (a 1-based HL7 sequence number) as the maximum. It then walks the segment's fields and reports each field whose sequence is greater than that maximum.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintExtraFields: Plugin<[], Root>;
export default hl7v2LintExtraFields;
```

## What it checks

This rule flags fields past the defined range for a segment. `MSH` in v2.5 ends at `MSH-21`, so any field at sequence 22 or higher is unexpected for that segment and version.

### Valid

`MSH` stops at `MSH-12` (Version ID) and all fields are within the v2.5 definition:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`MSH` carries a field at sequence 22, which is past the v2.5 maximum of `MSH-21`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5||||||||||EXTRA
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
Field `MSH-22` has no definition; `MSH` defines 21 fields in HL7 v2.5.
```

The field count is the profile's highest sequence number, and the version is taken from the annotated profile context. One message is reported per extra field.

## Part of Glion

`@glion/lint-profile-extra-fields` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

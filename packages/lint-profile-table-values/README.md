# @glion/lint-profile-table-values

Lint rule to validate coded field values against HL7v2 tables.

## What it does

Flags coded field values that are not codes of the HL7-defined table referenced by the field's profile. The rule reads the profile context attached by `@glion/annotate-profile-context`, looks up the field's table by its TBL# (such as `HL70003`), and checks the first subcomponent of each repetition against the table's codes. Only `hl7`-type tables are validated; user-defined tables, empty values, and Z-segments are skipped.

## Install

```bash
npm install @glion/lint-profile-table-values
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintTableValues from "@glion/lint-profile-table-values";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
  "EVN|A01\r",
].join("");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2LintTableValues)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintTableValues)`

A `unified` lint rule plugin. Takes no options.

Reads `file.data.profile`. For each field whose profile declares a `table`, loads the table definition from `ctx.tables`. If the table is HL7-defined, it checks each repetition's first subcomponent value against the table's codes.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintTableValues: Plugin<[], Root>;
export default hl7v2LintTableValues;
```

## What it checks

This rule flags coded values that are not codes of the HL7 table referenced by the field's profile. For example, `EVN-1` (Event Type Code) references table `HL70003`, whose v2.5 codes include `A01`, `A02`, and `A03`.

### Valid

`EVN-1` is `A01`, a code of table `HL70003`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01
```

### Invalid

`EVN-1` is `ZZZ`, which is not a code of table `HL70003`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|ZZZ
```

Reported message:

```
The value is not in table `HL70003` (Event type); the field requires a code from it.
```

The message is placed on the repetition that holds the value. One message is reported per offending repetition, with `actual` set to the value and `expected` to the table's codes.

## Part of Glion

`@glion/lint-profile-table-values` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

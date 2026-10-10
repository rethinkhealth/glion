# @glion/lint-profile-table-values

Lint rule to validate coded field values against HL7v2 tables.

## What it does

Flags coded field values that are not present in the HL7-defined table referenced by the field's profile. The rule reads profile context attached by `@glion/annotate-profile-context`, resolves the table by id (stripping the `HL7` prefix, so `HL70001` looks up table `0001`), and checks the first component value of each repetition against the table's code set. Only fields whose datatype is primitive or a coded element (`CE`, `CF`, `CNE`, `CWE`) are checked; on any other composite the table lists the codes of a later component, such as the name type of an `XPN`. Only `hl7`-type tables are validated; user-defined tables, empty fields, and Z-segments are skipped.

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
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

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

Reads `file.data.profile`. For each non-empty field with a declared `table` reference in its profile and a primitive or coded element datatype, loads the table definition from `ctx.tables`. If the table is HL7-defined it checks each repetition's first subcomponent value against the table's code set.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintTableValues: Plugin<[], Root>;
export default hl7v2LintTableValues;
```

## What it checks

This rule flags coded values that are not members of the HL7 table referenced by the field's profile. For example, `PID-8` (Administrative Sex) references table `HL70001`, whose v2.5 codes include `F`, `M`, `O`, `U`, `A`, `N`.

### Valid

`PID-8` is `F`, which is a valid code in table `0001`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

`PID-8` is `Z`, which is not in table `0001`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|Z
```

Reported message:

```
Field PID-8 (Administrative Sex) value 'Z' is not in table 0001 (Administrative Sex)
```

When the field has a profile name it appears in parentheses. The table id is reported without the `HL7` prefix, matching the way the tables store keys its entries. One message is reported per offending repetition.

## Part of Glion

`@glion/lint-profile-table-values` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

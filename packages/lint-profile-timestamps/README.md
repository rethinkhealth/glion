# @glion/lint-profile-timestamps

Lint rule to warn when a DT, TM, or DTM value is not a valid date or time.

## What it does

Flags a date or time value that does not follow its datatype's format, or that names a month, day, hour, minute, second, or offset that does not exist, such as February 29 of a year that is not a leap year. It checks every primitive value whose datatype is DT (Date), TM (Time), or DTM (Date/Time), and TS.1 in every version. It needs the plugins `@glion/annotate-profile-context`, `@glion/annotate-profile-fields`, and `@glion/annotate-profile-datatypes` to run before it; `@glion/preset-lint-profile-recommended` includes them.

## Install

```bash
npm install @glion/lint-profile-timestamps
```

## Use

```ts
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import hl7v2LintTimestamps from "@glion/lint-profile-timestamps";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20260307143045||ADT^A01|MSG001|P|2.6\r",
  "PID|1||123||Doe^John||19000229\r",
].join("");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileDatatypes)
  .use(hl7v2LintTimestamps)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintTimestamps)`

A `unified` lint rule plugin. Takes no options. Reports one message for each value that is not a valid date or time, placed on the field repetition, component, or subcomponent that holds it (`place` and `ancestors`), with the value in `actual`. The message names the value, not the element; a reporter shows the line and column.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintTimestamps: Plugin<[], Root>;
export default hl7v2LintTimestamps;
```

## What it checks

A value has its datatype's form, and names a date and time that exist:

| Datatype | Form                                             |
| -------- | ------------------------------------------------ |
| DT       | `YYYY[MM[DD]]`                                   |
| TM       | `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`               |
| DTM      | `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]` |

The month is `01` to `12`, the day is at most the number of days in its month (February has 29 days in a year divisible by 4, except a year divisible by 100 and not by 400), the hour is `00` to `23`, the minute and second are `00` to `59`, and an offset is at most 14 hours with minutes `00` to `59`. The date is checked as written, before the offset applies.

TS.1 is checked as a DTM in every version, though v2.2 to v2.4 type it ST. A primitive TS, as in v2.1, is checked as a DTM. Empty values, the explicit null `""`, and fields of segments the standard does not define are not checked.

### Valid

`PID-7` is February 29 of 1980, a leap year:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20260307143045||ADT^A01|MSG001|P|2.5
PID|1||123||Doe^John||19800229
```

### Invalid

`PID-7` is February 29 of 1900, which is divisible by 100 and not by 400:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20260307143045||ADT^A01|MSG001|P|2.6
PID|1||123||Doe^John||19000229
```

Reported message:

```
The day is past the end of its month; a date must name a day its month has.
```

`IN1-12` (DT) is written with ISO 8601 separators:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20260307143045||ADT^A01|MSG001|P|2.5
IN1|1|PLAN|123|||||||||2026-01-01
```

Reported message:

```
The value is not a date; a DT value has the form `YYYY[MM[DD]]`.
```

In v2.5, where PID-7 is a TS, the value is TS.1, and the message is placed on the component PID-7.1.

## Part of Glion

`@glion/lint-profile-timestamps` is part of **[Glion]**, the application framework for HL7v2.
See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

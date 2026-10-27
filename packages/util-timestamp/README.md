# @glion/util-timestamp

HL7v2 DT, TM, and DTM parser and formatter with precision and calendar checks.

## What it does

Reads an HL7v2 DT (Date), TM (Time), or DTM (Date/Time) value into a plain object holding the fields the value gives, and writes such an object back as HL7v2 text. A value keeps its precision: `202603` is March 2026, with no day. A parse checks the format and the calendar, so `20250229` fails because 2025 is not a leap year. Parsing never throws: it returns the value or the reason it is not valid. The fields are the sender's local time, with the offset when the value gives one. `nowDTM()` reads the current time, in the host's time zone or a named one, with that zone's offset. Zero runtime dependencies.

## Install

```bash
npm install @glion/util-timestamp
```

## Use

```ts
import { formatDTM, parseDTM } from "@glion/util-timestamp";

const result = parseDTM("20260307143045-0500");
// { success: true, data: { year: 2026, month: 3, day: 7, hour: 14,
//   minute: 30, second: 45, offset: "-0500", precision: "second" } }

if (result.success) {
  formatDTM(result.data); // "20260307143045-0500"
}

parseDTM("20250229");
// { success: false, issue: { code: "day-out-of-range", year: 2025,
//   month: 2, day: 29, daysInMonth: 28 } }
```

## API

### `parseDT(value: string): ParseResult<DT>`

Parses a DT value, `YYYY[MM[DD]]`.

```ts
parseDT("202603"); // { success: true, data: { year: 2026, month: 3, precision: "month" } }
parseDT("2026-03-07"); // { success: false, issue: { code: "invalid-format" } }
```

### `parseTM(value: string): ParseResult<TM>`

Parses a TM value, `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`.

```ts
parseTM("1430-0500"); // { success: true, data: { hour: 14, minute: 30, offset: "-0500", precision: "minute" } }
parseTM("2400"); // { success: false, issue: { code: "hour-out-of-range", hour: 24 } }
```

### `parseDTM(value: string): ParseResult<DTM>`

Parses a DTM value, `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`, or the TS.1 of a TS. The date is checked as written, before the offset applies.

```ts
parseDTM("20260307143045.12"); // { success: true, data: { ..., second: 45, fraction: "12", precision: "fraction" } }
parseDTM("20261307"); // { success: false, issue: { code: "month-out-of-range", month: 13 } }
```

### `formatDT(date: DT): string`, `formatTM(time: TM): string`, `formatDTM(dateTime: DTM): string`

Write a value as HL7v2 text, with the fields it has. For every valid value, `formatDTM(parseDTM(value).data) === value`, and the same for DT and TM.

```ts
formatDT({ year: 2026, month: 3, precision: "month" }); // "202603"
formatTM({ hour: 9, offset: "+0545", precision: "hour" }); // "09+0545"
formatDTM({ year: 99, precision: "year" }); // "0099"
```

### `nowDTM(options?: NowDTMOptions): DTM`

Returns the current time as a DTM, read in the host's time zone or in `timeZone`, with that zone's offset from UTC at this moment, daylight saving time included. The precision defaults to `fraction`: every field, and the milliseconds as a 3-digit `fraction`. A value that stops at the year, month, or day is a date and has no offset unless `offset` is `true`. With `timeZone: "UTC"`, the offset is `-0000`, UTC with no local time zone; every other zone at offset zero, such as `Etc/UTC`, `Europe/London` in winter, or a host whose time zone is UTC, gives `+0000`. The fields are the date and time in that zone: a value for a facility in another zone needs that zone. Throws a `RangeError` when `timeZone` is not an IANA time zone name.

In a TS, HL7v2 v2.1 accepts only `minute` or `second`; v2.2 adds `day` and `fraction`; v2.3 and later accept every precision.

```ts
import { formatDTM, nowDTM, Precision } from "@glion/util-timestamp";

formatDTM(nowDTM()); // "20240115023000.123-0500"
formatDTM(nowDTM({ precision: Precision.Second })); // "20240115023000-0500"
formatDTM(nowDTM({ timeZone: "UTC" })); // "20240115073000.123-0000"
formatDTM(nowDTM({ offset: false, precision: Precision.Minute })); // "202401150230"
formatDTM(nowDTM({ precision: Precision.Day })); // "20240115"
```

| Option      | Type        | Default                                                    | Description                                                 |
| ----------- | ----------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `precision` | `Precision` | `fraction`, with the milliseconds                          | The last field the value gives                              |
| `timeZone`  | `string`    | the host's time zone                                       | An IANA time zone name, such as `America/New_York` or `UTC` |
| `offset`    | `boolean`   | `true` from the hour on, `false` for a year, month, or day | Whether the value gives its offset from UTC                 |

### `DT`, `TM`, `DTM`

The parsed value. A field is present only when the value gives it.

| Field       | Type     | In          | Description                                                                                                                                                     |
| ----------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `year`      | `number` | DT, DTM     | The year as written, `0` to `9999`                                                                                                                              |
| `month`     | `number` | DT, DTM     | `1` to `12`                                                                                                                                                     |
| `day`       | `number` | DT, DTM     | `1` to the number of days in the month                                                                                                                          |
| `hour`      | `number` | TM, DTM     | `0` to `23`; always present in a TM                                                                                                                             |
| `minute`    | `number` | TM, DTM     | `0` to `59`                                                                                                                                                     |
| `second`    | `number` | TM, DTM     | `0` to `59`                                                                                                                                                     |
| `fraction`  | `string` | TM, DTM     | The 1 to 4 digits after the second, as written: `"1230"` for `.1230`. Present when `precision` is `fraction`                                                    |
| `offset`    | `string` | TM, DTM     | The offset from UTC as written, `+/-HHMM`: `"-0500"`. From v2.9, `"-0000"` is UTC with no local time zone known, and `"+0000"` a local time zone at offset zero |
| `precision` | `string` | DT, TM, DTM | The last field the value gives, one of the `Precision` values                                                                                                   |

### `Precision`

| Constant             | Value        | DTM written as              |
| -------------------- | ------------ | --------------------------- |
| `Precision.Year`     | `"year"`     | `YYYY`                      |
| `Precision.Month`    | `"month"`    | `YYYYMM`                    |
| `Precision.Day`      | `"day"`      | `YYYYMMDD`                  |
| `Precision.Hour`     | `"hour"`     | `YYYYMMDDHH`                |
| `Precision.Minute`   | `"minute"`   | `YYYYMMDDHHMM`              |
| `Precision.Second`   | `"second"`   | `YYYYMMDDHHMMSS`            |
| `Precision.Fraction` | `"fraction"` | `YYYYMMDDHHMMSS.S[S[S[S]]]` |

A DT is `year`, `month`, or `day`; a TM is `hour`, `minute`, `second`, or `fraction`. The number of digits after the second is the length of `fraction`.

### `ParseResult<T>` and `TimestampIssue`

```ts
type ParseResult<T> =
  { success: true; data: T } | { success: false; issue: TimestampIssue };
```

| `issue.code`          | Meaning                                                    | Other fields                            |
| --------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `invalid-format`      | The characters do not follow the datatype's format         |                                         |
| `month-out-of-range`  | The month is not `01` to `12`                              | `month`                                 |
| `day-out-of-range`    | The day is `00`, or past the last day of its month         | `year`, `month`, `day`, `daysInMonth`   |
| `hour-out-of-range`   | The hour is not `00` to `23`                               | `hour`                                  |
| `minute-out-of-range` | The minute is not `00` to `59`                             | `minute`                                |
| `second-out-of-range` | The second is not `00` to `59`                             | `second`                                |
| `offset-out-of-range` | The offset's hours are over `14`, or its minutes over `59` | `offset`, as written, such as `"+1500"` |

A DTM reports the date first, then the time, then the offset.

## Part of Glion

`@glion/util-timestamp` is part of **[Glion]**, the application framework for HL7v2.
See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

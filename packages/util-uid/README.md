# @glion/util-uid

Time-ordered, HL7v2-safe unique IDs.

## What it does

`@glion/util-uid` generates short, sortable, HL7v2-safe unique IDs. Use them for MSH-10 message control IDs, order numbers, or any field that needs a unique identifier.

An ID is 20 characters: a 10-character millisecond timestamp followed by 10 random characters, both in Crockford base32. This is the ULID design, shortened to fit MSH-10's 20-character limit — a real ULID is 26 characters and does not fit. IDs from different milliseconds sort in creation order as plain strings. IDs from the same millisecond are unique but not ordered, because every call draws fresh randomness, like the standard `ulid()`.

The alphabet is digits and uppercase letters, minus I, L, O, and U. Nothing in it can be confused with an HL7 delimiter, misread over the phone, or mangled by a legacy interface engine.

## Install

```bash
npm install @glion/util-uid
```

## Use

```ts
import { uid } from "@glion/util-uid";

const controlId = uid(); // e.g. for MSH-10
// "01J9Z6M8QKT5W3XA9C0D" — 20 characters, sorts by generation time
```

Need a branded ID? Compose it: `"MKE" + uid({ size: 17 })`.

## API

### `uid(options?)`

Generates a time-ordered unique identifier.

| Parameter      | Type     | Default | Description                      |
| -------------- | -------- | ------- | -------------------------------- |
| `options.size` | `number` | `20`    | Total length of the generated ID |

The time part needs 10 characters: keep `size >= 11`, or the ID degrades to a pure-random tail (unique, but not time-ordered). `size` must be a positive integer (`RangeError` otherwise). Per-millisecond uniqueness rests entirely on the random tail, so prefer the full default width when volumes are high.

## Part of Glion

`@glion/util-uid` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

# @glion/util-uid

Time-ordered, HL7v2-safe unique IDs.

## What it does

`@glion/util-uid` generates time-ordered unique identifiers for HL7v2 identifier fields — the flagship use case is minting MSH-10 message control IDs, but the IDs work anywhere a sortable, delimiter-free identifier is needed (placer/filler order numbers, correlation IDs in logs). The scheme is the ULID idea resized to a 20-character default, chosen to fit the tightest common constraint: MSH-10's ST limit (a standard 26-character ULID cannot fit). The default 20-character ID is 10 characters of Crockford-base32 millisecond timestamp followed by 10 characters of randomness (50 bits per millisecond), so IDs sort lexicographically by millisecond; calls within the same millisecond are unique but carry no defined order (the same semantics as the ULID reference implementation's default `ulid()` — stateless, fresh randomness every call). The alphabet is uppercase alphanumerics without I, L, O, U — no HL7 delimiters, nothing legacy engines or verbal readback confuse.

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

# @glion/util-charset

Encode and decode HL7v2 wire bytes as UTF-8 (fatal, no silent corruption).

## What it does

HL7v2 travels as bytes, but the rest of an HL7v2 pipeline (parsing, querying, linting) works in strings — so something has to convert between the two. This package is that step, in both directions.

For now it handles **UTF-8 only** — the HL7 2.x baseline and a strict superset of 7-bit ASCII. Decoding is **fatal**: a non-UTF-8 feed throws here instead of being silently corrupted into `U+FFFD` replacement characters (the failure behind [issue #659](https://github.com/rethinkhealth/glion/issues/659)). The package is zero-dependency and runtime-agnostic — just the Web platform's `TextEncoder` / `TextDecoder`.

Honouring the character set a message declares (MSH-18, byte-order marks, and other encodings for legacy peers) is deferred and tracked in [issue #662](https://github.com/rethinkhealth/glion/issues/662); the package exists as the home for that future work.

## Install

```bash
npm install @glion/util-charset
```

## Use

```typescript
import { decodeBytes, encodeBytes } from "@glion/util-charset";

// Inbound: de-framed payload bytes -> text.
const text = decodeBytes(payload);

// Outbound: text -> UTF-8 wire bytes.
const wire = encodeBytes(text);
```

## API

### `decodeBytes(bytes)`

Decodes UTF-8 payload bytes (after MLLP de-framing) to text. A leading UTF-8 BOM is stripped.

- `bytes` (`Uint8Array`) — The de-framed payload bytes.
- Returns `string` — The decoded HL7v2 text.
- Throws `CharsetError` (`code: "INCOMPATIBLE_CHARSET"`) — When the bytes carry a non-UTF-8 byte-order mark or are otherwise not valid UTF-8.

### `encodeBytes(text)`

Encodes HL7v2 text to UTF-8 wire bytes.

- `text` (`string`) — The HL7v2 message text.
- Returns `Uint8Array` — The UTF-8 wire bytes.

## Part of Glion

`@glion/util-charset` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

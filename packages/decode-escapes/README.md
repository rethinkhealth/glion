# @glion/decode-escapes

Unified plugin that reads the escape sequences of every subcomponent value with `escapes.read` from `@glion/utils`.

## What it does

Walks an HL7v2 AST and replaces each `subcomponent` node's `value` with `escapes.read(value, delimiters)`, except in MSH-1 and MSH-2, which hold the delimiters themselves. It applies the same rule as `@glion/parser`: only the separators and the characters below U+0020 are read from their escape sequences, and everything else stays as written, the escape character included.

`@glion/parser` already reads escape sequences while parsing, so the plugin is for a tree parsed with `decodeEscapes: false`. On a tree the parser has read, it changes nothing: it reads with the delimiters MSH declares, and reading a value twice gives the same value as reading it once.

## Install

```bash
npm install @glion/decode-escapes
```

## Use

```js
import { hl7v2DecodeEscapes } from "@glion/decode-escapes";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

const msg = `OBX|1|TX|ID123||Patient allergic to \\F\\Peanuts\\F\\ and \\.br\\Severe reaction`;

const processor = unified()
  .use(hl7v2Parser, { decodeEscapes: false })
  .use(hl7v2DecodeEscapes);
const tree = await processor.run(processor.parse(msg));
```

Before the plugin runs, `subcomponent.value` holds the text as written:

```json
{
  "type": "subcomponent",
  "index": 1,
  "value": "Patient allergic to \\F\\Peanuts\\F\\ and \\.br\\Severe reaction"
}
```

After it runs:

```json
{
  "type": "subcomponent",
  "index": 1,
  "value": "Patient allergic to |Peanuts| and \\.br\\Severe reaction"
}
```

## API

### `unified().use(hl7v2DecodeEscapes[, options])`

Reads the escape sequences of every `subcomponent` value outside MSH-1 and MSH-2 with `escapes.read`, in place.

###### Parameters

- `options.delimiters` (optional) — Override delimiters. If omitted, the plugin reads them from `file.data.delimiters` (set by `@glion/annotate-delimiters`), or else from MSH-1 and MSH-2, with the HL7 standard (`| ^ ~ & \`) for any they do not declare.

###### Returns

Nothing (`undefined`). Mutates the AST in-place.

## Behavior

| On the wire                               | In the value                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| `\F\`, `\S\`, `\R\`, `\T\`                | the field, component, repetition, or subcomponent separator |
| `\Xdd\`, such as `\X0D\`                  | the character below U+0020 it names                         |
| any other escape sequence                 | kept as written                                             |
| an escape character without a closing one | kept as written                                             |

Kept as written: `\E\`, `\P\`, `\H\`, `\N\`, every formatting command such as `\.br\` or `\.sp 2\`, any other `\X…\` such as `\XC3A9\`, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define. A separator whose named code holds a delimiter is read from its `\Xdd\`.

Delimiter resolution order: `options.delimiters` → `file.data.delimiters` (set by `@glion/annotate-delimiters`) → MSH-1 and MSH-2 → HL7 defaults.

## See also

- [`escapes` in `@glion/utils`](https://github.com/rethinkhealth/glion/tree/main/packages/utils#escapes) — the function this plugin applies, for a single value.
- [`@glion/encode-escapes`](https://github.com/rethinkhealth/glion/tree/main/packages/encode-escapes) — the reverse, with `escapes.write`.

## Part of Glion

`@glion/decode-escapes` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

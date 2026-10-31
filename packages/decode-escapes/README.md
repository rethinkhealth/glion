# @glion/decode-escapes

Unified plugin to decode HL7v2 escape sequences in literal values.

## What it does

Walks an HL7v2 AST and decodes escape sequences found in `subcomponent` nodes, replacing `node.value` with the decoded text. It decodes the separator escapes (`\F\`, `\S\`, `\R\`, `\T\`) and the hexadecimal escapes of control characters (`\X0D\`, `\X0A\`, …). Every other sequence stays as written: `\E\`, `\P\`, a formatting command such as `\H\`, `\.br\`, or `\.sp 2\`, any other `\X…\`, a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`).

`@glion/parser` decodes escape sequences while parsing, so this plugin is for a tree parsed with `decodeEscapes: false`. Decoding a value twice gives the same value as decoding it once: `\E\F\E\` stays `\E\F\E\`.

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

const file = await unified()
  .use(hl7v2Parser, { decodeEscapes: false })
  .use(hl7v2DecodeEscapes)
  .process(msg);
```

Before decoding, `subcomponent.value` contains the raw HL7 text:

```json
{
  "type": "subcomponent",
  "index": 1,
  "value": "Patient allergic to \\F\\Peanuts\\F\\ and \\.br\\Severe reaction"
}
```

After this plugin runs:

```json
{
  "type": "subcomponent",
  "index": 1,
  "value": "Patient allergic to |Peanuts| and \\.br\\Severe reaction"
}
```

## API

### `unified().use(hl7v2DecodeEscapes[, options])`

Decode HL7v2 escape sequences in literal nodes.

###### Parameters

- `options.delimiters` (optional) — Override delimiters. If omitted, the plugin reads them from `file.data.delimiters` (set by `@glion/annotate-delimiters`). Defaults to the HL7 standard (`| ^ ~ & \`).

###### Returns

Nothing (`undefined`). Mutates the AST in-place.

## Behavior

The plugin visits every `subcomponent` node and rewrites `node.value`.

Each escape sequence is decoded as follows:

| Input     | Output                                         |
| --------- | ---------------------------------------------- |
| `\F\`     | field separator (default `\|`)                 |
| `\S\`     | component separator (default `^`)              |
| `\R\`     | repetition separator (default `~`)             |
| `\T\`     | subcomponent separator (default `&`)           |
| `\Xdd\`   | the character below U+0020 it names            |
| `\E\`     | kept as written (escape character)             |
| `\P\`     | kept as written (truncation character)         |
| `\.br\`   | kept as written (line break command)           |
| `\XC3A9\` | kept as written (any other hexadecimal data)   |
| `\H\`     | kept as written (highlight on)                 |
| `\N\`     | kept as written (normal text)                  |
| `\.sp 2\` | kept as written (any other formatting command) |
| `\Z…\`    | kept as written (locally defined sequence)     |
| `\C2842\` | kept as written (character set switch)         |

Delimiter resolution order: `options.delimiters` → `file.data.delimiters` (set by `@glion/annotate-delimiters`) → HL7 defaults.

The plugin only transforms AST nodes and does not execute code. The inverse operation is provided by [`@glion/encode-escapes`](https://github.com/rethinkhealth/glion/tree/main/packages/encode-escapes).

## Part of Glion

`@glion/decode-escapes` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

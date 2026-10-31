# @glion/encode-escapes

Unified plugin to encode special characters as HL7v2 escape sequences in literal values.

## What it does

Walks an HL7v2 AST and encodes delimiter and control characters found in `subcomponent` node values as HL7v2 escape sequences. It is the inverse of [`@glion/decode-escapes`](https://github.com/rethinkhealth/glion/tree/main/packages/decode-escapes) for the separators and control characters: a value without the escape character is encoded and decoded back to itself.

`@glion/to-hl7v2` encodes escape sequences while serializing, so this plugin is for a tree written with `encodeEscapes: false`.

## Install

```bash
npm install @glion/encode-escapes
```

## Use

```js
import { hl7v2EncodeEscapes } from "@glion/encode-escapes";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";

// After modifying AST values that may contain delimiters:
const file = await unified()
  .use(hl7v2EncodeEscapes) // encode special chars as escape sequences
  .use(hl7v2ToHl7v2, { encodeEscapes: false }) // serialize AST to HL7v2 text
  .stringify(tree);
```

Before encoding, a `subcomponent.value` might contain literal delimiters:

```json
{
  "type": "subcomponent",
  "value": "Patient allergic to |Peanuts| and \rSevere reaction"
}
```

After this plugin runs:

```json
{
  "type": "subcomponent",
  "value": "Patient allergic to \\F\\Peanuts\\F\\ and \\X0D\\Severe reaction"
}
```

## API

### `unified().use(hl7v2EncodeEscapes[, options])`

Encode special characters as HL7v2 escape sequences in literal nodes.

###### Parameters

- `options.delimiters` (optional) — Override delimiters. If omitted, the plugin reads them from `file.data.delimiters` (set by `@glion/annotate-delimiters`). Defaults to the HL7 standard (`| ^ ~ & \`).

###### Returns

Nothing (`undefined`). Mutates the AST in-place.

## Behavior

The plugin visits every `subcomponent` node and rewrites `node.value`, substituting separators and control characters with their HL7v2 escape sequences. An escape sequence already in a value, such as `\E\`, `\H\`, `\.br\`, or `\XC3A9\`, is written as it is. An escape character that starts no sequence, or whose sequence would hold a separator, is written as `\E\`: `a\b|c` becomes `a\E\b\F\c`.

| Input                       | Output                         |
| --------------------------- | ------------------------------ |
| `\|`                        | `\F\` (field separator)        |
| `^`                         | `\S\` (component separator)    |
| `~`                         | `\R\` (repetition separator)   |
| `&`                         | `\T\` (subcomponent separator) |
| `\` that starts no sequence | `\E\` (escape character)       |
| characters below U+0020     | `\Xdd\` (hexadecimal escape)   |

A character whose escape code holds a delimiter, such as `|` when `F` is the component separator, is written as `\Xdd\`, the hexadecimal escape of its UTF-8 bytes. A value holding a character that no escape sequence can write with the delimiters makes the plugin throw `EscapeSequenceError`, exported by `@glion/utils`.

Delimiter resolution order: `options.delimiters` → `file.data.delimiters` (set by `@glion/annotate-delimiters`) → HL7 defaults.

This is the inverse of [`@glion/decode-escapes`](https://github.com/rethinkhealth/glion/tree/main/packages/decode-escapes):

```js
import { hl7v2DecodeEscapes } from "@glion/decode-escapes";
import { hl7v2EncodeEscapes } from "@glion/encode-escapes";

// encode → decode round-trip
const encoded = await unified().use(hl7v2EncodeEscapes).run(tree);
const decoded = await unified().use(hl7v2DecodeEscapes).run(encoded);
// decoded values === original values, for values without the escape character
```

The plugin only transforms AST nodes and does not execute code.

## Part of Glion

`@glion/encode-escapes` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

# @glion/encode-escapes

Unified plugin that writes the escape sequences of every subcomponent value with `escapes.write` from `@glion/utils`.

## What it does

Walks an HL7v2 AST and replaces each `subcomponent` node's `value` with `escapes.write(value, delimiters)`, except in MSH-1 and MSH-2, which hold the delimiters themselves. It applies the same rule as `@glion/to-hl7v2`: only the separators and the characters below U+0020 are written as escape sequences, and everything else is written as it is, the escape character included.

`@glion/to-hl7v2` already writes escape sequences while serializing, so the plugin is for a tree written with `encodeEscapes: false`.

## Install

```bash
npm install @glion/encode-escapes
```

## Use

```js
import { hl7v2EncodeEscapes } from "@glion/encode-escapes";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";

await unified().use(hl7v2EncodeEscapes).run(tree);
const text = toHl7v2(tree, undefined, { encodeEscapes: false });
```

Before the plugin runs, a `subcomponent.value` may hold separators and control characters:

```json
{
  "type": "subcomponent",
  "value": "Patient allergic to |Peanuts| and \rSevere reaction"
}
```

After it runs:

```json
{
  "type": "subcomponent",
  "value": "Patient allergic to \\F\\Peanuts\\F\\ and \\X0D\\Severe reaction"
}
```

## API

### `unified().use(hl7v2EncodeEscapes[, options])`

Writes the escape sequences of every `subcomponent` value outside MSH-1 and MSH-2 with `escapes.write`, in place.

###### Parameters

- `options.delimiters` (optional) — Override delimiters. If omitted, the plugin reads them from `file.data.delimiters` (set by `@glion/annotate-delimiters`), or else from MSH-1 and MSH-2, with the HL7 standard (`| ^ ~ & \`) for any they do not declare.

###### Returns

Nothing (`undefined`). Mutates the AST in-place. Throws `EscapeSequenceError`, exported by `@glion/utils`, when a value holds a character that no escape sequence can write with the delimiters.

## Behavior

| In the value                                         | On the wire                |
| ---------------------------------------------------- | -------------------------- |
| field, component, repetition, subcomponent separator | `\F\`, `\S\`, `\R\`, `\T\` |
| a character below U+0020, such as a carriage return  | `\Xdd\`, such as `\X0D\`   |
| any other character, the escape character included   | written as it is           |

An escape sequence already in a value, such as `\E\`, `\H\`, `\.br\`, or `\XC3A9\`, is written as it is, and so is an escape character that starts no sequence, such as the one in `C:\temp`. An escape character whose closing one, or the end of the value when it has none, comes after a separator or a control character is written `\E\`, so that it does not pair with their escape sequences: `a\b|c` is written `a\E\b\F\c`. A data escape character is written `\E\` in the value, or `\X5C\` when `E` is a delimiter. A separator whose named code holds a delimiter, such as `|` when `F` is the component separator, is written as `\Xdd\`, the hexadecimal escape of its UTF-8 bytes.

Delimiter resolution order: `options.delimiters` → `file.data.delimiters` (set by `@glion/annotate-delimiters`) → MSH-1 and MSH-2 → HL7 defaults.

`@glion/decode-escapes` reads a value this plugin wrote back to itself when the value holds no escape character.

## See also

- [`escapes` in `@glion/utils`](https://github.com/rethinkhealth/glion/tree/main/packages/utils#escapes) — the function this plugin applies, for a single value.
- [`@glion/decode-escapes`](https://github.com/rethinkhealth/glion/tree/main/packages/decode-escapes) — the reverse, with `escapes.read`.

## Part of Glion

`@glion/encode-escapes` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

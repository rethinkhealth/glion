# @glion/lint-delimiters-duplicate

Lint rule that reports an HL7v2 message header that declares two delimiters with the same character.

## What it does

MSH-1 declares a message's field separator, and MSH-2's encoding characters declare its component separator, repetition separator, escape character, and subcomponent separator. When two delimiters are the same character, a value cannot be told apart from its delimiters or its escape sequences: under `MSH|^~&&`, the value `a|b`, written `a&F&b`, reads as the subcomponents `a`, `F`, and `b`. This rule reports each delimiter that is the same character as an earlier one. Its severity is `error` in `@glion/preset-lint-recommended`.

## Install

```bash
npm install @glion/lint-delimiters-duplicate
```

## Use

```ts
import hl7v2LintDelimitersDuplicate from "@glion/lint-delimiters-duplicate";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2LintDelimitersDuplicate, ["error"]);
const file = new VFile("MSH|^~&&|APP\rPID|1\r");

await processor.run(processor.parse(file), file);

file.messages[0]?.message;
// "The subcomponent separator is the same character as the escape character."
file.messages[0]?.fatal;
// true
```

## API

### `unified().use(hl7v2LintDelimitersDuplicate[, severity])`

Reads MSH-1 and MSH-2 of the message header segment the message opens with, as `delimiters()` from `@glion/util-query` reads them. Reports on MSH-2. Takes no options. A message that does not open with a message header segment is not reported. Reports at `warning` unless configured at `["error"]`.

```ts
import type { Root } from "@glion/ast";
import type { Plugin } from "unified";

declare const hl7v2LintDelimitersDuplicate: Plugin<[unknown?], Root>;
export default hl7v2LintDelimitersDuplicate;
```

## What it checks

A delimiter that is the same character as an earlier one is reported once, against the first delimiter with its character, and the message sets `actual` to the character. The delimiters are taken in the order field separator, component separator, repetition separator, escape character, subcomponent separator. Each message sets `note` to the HL7v2 rule it breaks. `@glion/parser` ends MSH-2 at the field separator, so only a tree that was not parsed can repeat the field separator in MSH-2. The truncation character, a fifth character of MSH-2 in some HL7v2 versions, is not compared.

### Valid

```ts
"MSH|^~\\&|APP\rPID|1\r";
"MSH|^~&|APP\rPID|1\r";
```

### Invalid

```ts
"MSH|^~^^|APP\r";
```

```text
The escape character is the same character as the component separator.
The subcomponent separator is the same character as the component separator.
```

## Part of Glion

`@glion/lint-delimiters-duplicate` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

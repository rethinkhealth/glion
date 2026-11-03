# @glion/lint-encoding-characters-required

Lint rule that reports an HL7v2 message header whose encoding characters leave out a delimiter.

## What it does

MSH-2's encoding characters declare a message's component separator, repetition separator, escape character, and subcomponent separator, in that order. HL7v2 v2.4 to v2.6 let a message leave out the escape character when it holds no escape sequences, and the subcomponent separator when it holds no subcomponents. Later versions do not mention leaving them out. `@glion/parser` reads a delimiter MSH-2 leaves out as absent: `MSH|^~&` declares the escape character `&` and no subcomponent separator. This rule reports each delimiter MSH-2 leaves out, so a sender's short encoding characters are found before the message is read with delimiters it did not mean. Its severity is `warning`, the default, in `@glion/preset-lint-recommended`.

## Install

```bash
npm install @glion/lint-encoding-characters-required
```

## Use

```ts
import hl7v2LintEncodingCharactersRequired from "@glion/lint-encoding-characters-required";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2LintEncodingCharactersRequired);
const file = new VFile("MSH|^~&|APP\rPID|1\r");

await processor.run(processor.parse(file), file);

file.messages[0]?.message;
// "The encoding characters declare no subcomponent separator."
```

## API

### `unified().use(hl7v2LintEncodingCharactersRequired[, severity])`

Reads MSH-2 of the message header segment the message opens with, as `delimiters()` from `@glion/util-query` reads it, and reports on MSH-2, or on the message header segment when it has no MSH-2. Takes no options. A message that does not open with a message header segment is not reported.

```ts
import type { Root } from "@glion/ast";
import type { Plugin } from "unified";

declare const hl7v2LintEncodingCharactersRequired: Plugin<[unknown?], Root>;
export default hl7v2LintEncodingCharactersRequired;
```

## What it checks

| MSH-2                             | Reported message                                             |
| --------------------------------- | ------------------------------------------------------------ |
| MSH-2 is empty                    | `The encoding characters declare no component separator.`    |
| MSH-2 has fewer than 2 characters | `The encoding characters declare no repetition separator.`   |
| MSH-2 has fewer than 3 characters | `The encoding characters declare no escape character.`       |
| MSH-2 has fewer than 4 characters | `The encoding characters declare no subcomponent separator.` |

Each delimiter MSH-2 leaves out is reported. Each message sets `note` to how HL7v2 declares the encoding characters.

### Valid

```ts
"MSH|^~\\&|APP\rPID|1\r";
"MSH|^~\\&#|APP\rPID|1\r";
```

### Invalid

```ts
"MSH|^|APP\r";
```

```text
The encoding characters declare no repetition separator.
The encoding characters declare no escape character.
The encoding characters declare no subcomponent separator.
```

## When not to use it

HL7v2 v2.4 to v2.6 let a message that holds no escape sequences and no subcomponents leave out the escape character and the subcomponent separator. A team that receives such messages from a known sender can turn the rule off for them.

## Part of Glion

`@glion/lint-encoding-characters-required` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

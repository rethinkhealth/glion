# @glion/utils

Shared helpers for HL7v2 work — escape sequences, diagnostics reporting, length/byte measurement, and conformance checks.

## What it does

Provides the low-level utilities used across the Glion ecosystem: `escapes.read`/`escapes.write` for the escape sequences of a value, a `report()` function for emitting diagnostics onto a `VFile`, `getLength`/`getByteLength` for measuring any AST node without serializing it, and stateless `checkOptionality`/`checkCardinality`/`checkLength` conformance validators. Linters and transformers reach for this package to avoid reimplementing these primitives.

## Install

```bash
npm install @glion/utils
```

## Use

```typescript
import { report, getByteLength, checkCardinality } from "@glion/utils";
import type { Diagnostic } from "@glion/utils";
import { VFile } from "vfile";

const rule: Diagnostic = {
  type: "lint",
  namespace: "field",
  code: "required",
  title: "Required Field Missing",
  description: "A required field is missing from the segment.",
  severity: "error",
  message: (ctx) => `Field '${ctx.fieldPath}' is required`,
};

const file = new VFile();
report(file, rule, { context: { fieldPath: "PID-5" }, node: segmentNode });

const bytes = getByteLength(segmentNode);
const result = checkCardinality(fieldNode, 1, 5);
```

## API

### `report(file, rule, options?)`

Reports a diagnostic to a VFile. This is the standard way to report issues across Glion linters, validators, and transformers.

#### Parameters

- `file` (`VFile | null | undefined`) — The VFile to report to.
- `rule` (`Diagnostic`) — The diagnostic rule definition.
- `options` (`ReportOptions`, optional):
  - `node` (`Node`, optional) — The AST node related to the diagnostic.
  - `context` (`Record<string, unknown>`, optional) — Context data passed to the diagnostic's `message` function.

#### Example

```typescript
import { report } from "@glion/utils";
import type { Diagnostic } from "@glion/utils";
import { VFile } from "vfile";

const requiredFieldRule: Diagnostic = {
  type: "lint",
  namespace: "field",
  code: "required",
  title: "Required Field Missing",
  description: "A required field is missing from the segment.",
  severity: "error",
  message: (ctx) => `Field '${ctx.fieldPath}' is required`,
  helpUrl: "https://example.com/docs/required-field",
};

const file = new VFile();
report(file, requiredFieldRule, {
  context: { fieldPath: "PID-5" },
  node: segmentNode,
});
```

### `getByteLength(node)`

Calculates the byte length of any HL7v2 AST node. Efficiently computes the total serialized length including all children and separators (assumed to be 1 byte each).

#### Parameters

- `node` (`Nodes | null | undefined`) — The AST node to measure.

#### Returns

`number` — The total byte length when the node is serialized.

#### Algorithm

- For literal nodes (Subcomponent, SegmentHeader): returns the byte length of the value using UTF-8 encoding (i.e., `Buffer.byteLength(value, 'utf8')`).
- For parent nodes: recursively sums the byte length of all children plus 1 byte per separator between children.
- Handles all node types: Root, Segment, Group, Field, FieldRepetition, Component, Subcomponent.

O(n) time complexity where n is the total number of nodes in the tree.

#### Example

```typescript
import { getByteLength } from "@glion/utils";
import type { Field } from "@glion/ast";

const field: Field = {
  type: "field",
  children: [
    {
      type: "field-repetition",
      children: [
        {
          type: "component",
          children: [
            { type: "subcomponent", value: "SMITH" },
            { type: "subcomponent", value: "JOHN" },
          ],
        },
      ],
    },
  ],
};

// Calculate: SMITH&JOHN = 5 + 1 + 4 = 10 bytes
const length = getByteLength(field); // Returns: 10
```

### `getLength(node[, delimiters])`

Calculates the string length of any HL7v2 AST node. Efficiently computes the total serialized character length including all children and separators (assumed to be 1 character each).

#### Parameters

- `node` (`Nodes | null | undefined`) — The AST node to measure.
- `delimiters` (`Delimiters`, optional) — The delimiters of the message. With them, each value is counted as HL7v2 §2.7.1 counts it: as `escapes.write` writes it, each escape sequence by the characters between its two escape characters. `12\E\3` counts 4, `a&b` counts 3, and a carriage return, written `\X0D\`, counts 3. A character no escape sequence can write with them counts 1.

#### Returns

`number` — The total string length when the node is serialized.

#### Algorithm

- For literal nodes (Subcomponent, SegmentHeader): returns `value.length` (JavaScript string length), or the §2.7.1 length when `delimiters` is given.
- For parent nodes: recursively sums the string length of all children plus 1 character per separator between children.
- Handles all node types: Root, Segment, Group, Field, FieldRepetition, Component, Subcomponent.

#### Important note

Returns JavaScript string length (UTF-16 code units). For UTF-8 byte length (e.g., for wire protocol or size constraints), use `getByteLength` instead. These values differ for characters outside the ASCII range.

#### Example

```typescript
import { getLength, getByteLength } from "@glion/utils";

const subcomponent = { type: "subcomponent", value: "café" };

getLength(subcomponent); // 4 (4 characters)
getByteLength(subcomponent); // 5 (5 bytes in UTF-8: c-a-f-C3-A9)
```

### `escapes`

Reads and writes the escape sequences of a subcomponent value. It changes only the characters a value cannot hold as they are: the field, component, repetition, and subcomponent separators, and the characters below U+0020. Every other character, the escape character included, stays as it is written in both directions, except an escape character that the escape sequence of a separator or control character would pair with.

| In the value                                         | On the wire                           |
| ---------------------------------------------------- | ------------------------------------- |
| field, component, repetition, subcomponent separator | `\F\`, `\S\`, `\R\`, `\T\`            |
| a character below U+0020, such as a carriage return  | its `\Xdd\`, such as `\X0D\`          |
| a separator whose named code holds a delimiter       | its `\Xdd\`, such as `\X7C\` for `\|` |

#### `escapes.read(text, delimiters)`

The value the wire text `text` stands for. Each escape sequence in the table is read as its character, written exactly as `escapes.write` writes it: `\X0D\` is a carriage return, and `\X0d\` stays as written. Every other escape sequence stays as it is written: `\E\`, `\P\`, `\H\`, `\N\`, a formatting command such as `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, a code HL7v2 does not define, and an escape character without a closing one. With no escape character among the delimiters, the value is `text`. Reading twice gives the same value as reading once.

- `text` (`string`) — the value as it is on the wire.
- `delimiters` (`Delimiters`) — the delimiters of the message.

Returns the value as a `string`.

```typescript
import { DEFAULT_DELIMITERS, escapes } from "@glion/utils";

escapes.read("DOE\\T\\SMITH", DEFAULT_DELIMITERS); // "DOE&SMITH"
escapes.read("1. Normal\\.br\\2. Stable", DEFAULT_DELIMITERS); // "1. Normal\\.br\\2. Stable"
```

#### `escapes.write(value, delimiters)`

The text `value` takes on the wire. Each character in the table is written as its escape sequence, with a digit `A`–`F` of a `\Xdd\` in lowercase when its uppercase form is a delimiter. Every other character, the escape character included, is written as it is. Writing twice gives the same text as writing once, and a text read with `escapes.read` that holds no separator and no character below U+0020 is written back as it was read.

Escape sequences do not nest (HL7v2 §2.7.1). An escape character whose closing one, or the end of the value when it has none, comes after a separator or a control character would pair with the escape sequence written for that character, so it is written `\E\`, and so is the closing one: `a\b|c` is written `a\E\b\F\c`, and `C:\scans` followed by a tab is written `C:\E\scans\X09\`. Every separator and control character is read back; the escape character comes back as `\E\`.

A data escape character is written `\E\` in the value, or `\X5C\` when `E` is a delimiter. A delimiter the message does not declare is absent from `delimiters`, and its character is written as it is: with no subcomponent separator, `&` is data. The delimiters must be distinct characters.

- `value` (`string`) — the value to write.
- `delimiters` (`Delimiters`) — the delimiters of the message.

Returns the text as a `string`. Throws `EscapeSequenceError` when a character must be escaped and every escape sequence that writes it holds a delimiter, and `MissingEscapeCharacterError` when a character must be escaped and `delimiters` has no escape character.

```typescript
import { DEFAULT_DELIMITERS, escapes } from "@glion/utils";

escapes.write("DOE&SMITH", DEFAULT_DELIMITERS); // "DOE\\T\\SMITH"
escapes.write("1. Normal\\.br\\2. Stable", DEFAULT_DELIMITERS); // "1. Normal\\.br\\2. Stable"
escapes.write("C:\\temp", DEFAULT_DELIMITERS); // "C:\\temp"
escapes.write("a\\b|c", DEFAULT_DELIMITERS); // "a\\E\\b\\F\\c"
```

### `EscapeSequenceError`

Thrown by `escapes.write` for a character no escape sequence can write. `character` holds the character and `delimiters` the delimiters it was written with.

```typescript
import { escapes } from "@glion/utils";

const delimiters = {
  component: "S",
  escape: "\\",
  field: "X",
  repetition: "~",
  subcomponent: "&",
};

escapes.write("S", delimiters); // throws EscapeSequenceError
```

### `MissingEscapeCharacterError`

A subclass of `EscapeSequenceError`, thrown by `escapes.write` for a separator or a line break when `delimiters` has no escape character; every other character is written as it is. `character` holds the character and `delimiters` the delimiters it was written with.

```typescript
import { escapes } from "@glion/utils";

escapes.write("a|b", { component: "^", field: "|", repetition: "~" }); // throws MissingEscapeCharacterError
```

### `DEFAULT_DELIMITERS`, `ENCODING_CHARACTERS`, and `SEGMENT_TERMINATOR`

`DEFAULT_DELIMITERS` holds the delimiters HL7v2 recommends, which a message without a message header segment is read with: `|` (field), `^` (component), `~` (repetition), `\` (escape), and `&` (subcomponent). `SEGMENT_TERMINATOR` is `\r`, the carriage return that ends every segment. HL7v2 fixes it, so it is not one of the delimiters a message declares.

### Conformance utilities

Stateless, composable functions to validate HL7v2 AST nodes against constraints like optionality (usage), cardinality, and length.

#### `ValidationResult`

All conformance functions return a `ValidationResult` object:

```typescript
type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        expected?: string | number | Array<string | number>;
        actual?: string | number | Array<string | number>;
      };
    };
```

#### `checkOptionality(node, optionality)`

Checks if a node satisfies the optionality (usage) constraint.

- `node` (`Nodes | undefined`) — The AST node to check.
- `optionality` (`string`) — The usage code (e.g., `'R'`, `'O'`, `'X'`).
- Returns `ValidationResult`.

```typescript
import { checkOptionality } from "@glion/utils";

// 'R' (Required), 'RE' (Required or Empty), 'O' (Optional), 'X' (Not Supported)
const result = checkOptionality(myFieldNode, "R");

if (!result.ok) {
  console.error(result.error.message); // "is required but missing"
}
```

#### `checkCardinality(node, min, max)`

Checks if a field has the correct number of repetitions.

- `node` (`Field | undefined`) — The field node to check.
- `min` (`number`) — Minimum repetitions.
- `max` (`number | '*'`) — Maximum repetitions.
- Returns `ValidationResult`.

```typescript
import { checkCardinality } from "@glion/utils";

// Field must repeat between 1 and 5 times
const result = checkCardinality(myFieldNode, 1, 5);
```

#### `checkLength(node, max, min?)`

Checks if the content of a node falls within the minimum and maximum length.

- `node` (`Nodes | undefined`) — The node to check (length is calculated recursively).
- `max` (`number`) — Maximum length.
- `min` (`number`, optional, default `0`) — Minimum length.
- Returns `ValidationResult`.

```typescript
import { checkLength } from "@glion/utils";

// Content length must be between 1 and 10 characters
const result = checkLength(myNode, 10, 1);

// Content length must be at most 10 characters (min defaults to 0)
const result2 = checkLength(myNode, 10);
```

## Part of Glion

`@glion/utils` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

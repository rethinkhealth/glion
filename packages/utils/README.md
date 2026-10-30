# @glion/utils

Shared helpers for HL7v2 work — escape sequences, diagnostics reporting, length/byte measurement, and conformance checks.

## What it does

Provides the low-level utilities used across the Glion ecosystem: `decodeEscapes`/`encodeEscapes` for the escape sequences of a value, a `report()` function for emitting diagnostics onto a `VFile`, `getLength`/`getByteLength` for measuring any AST node without serializing it, and stateless `checkOptionality`/`checkCardinality`/`checkLength` conformance validators. Linters and transformers reach for this package to avoid reimplementing these primitives.

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

### `getLength(node)`

Calculates the string length of any HL7v2 AST node. Efficiently computes the total serialized character length including all children and separators (assumed to be 1 character each).

#### Parameters

- `node` (`Nodes | null | undefined`) — The AST node to measure.

#### Returns

`number` — The total string length when the node is serialized.

#### Algorithm

- For literal nodes (Subcomponent, SegmentHeader): returns `value.length` (JavaScript string length).
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

### `decodeEscapes(value, delimiters)`

The value `value` carries once its HL7v2 escape sequences are decoded. `\F\`, `\S\`, `\R\`, `\T\`, and `\E\` become the delimiter each stands for, `\.br\` the segment terminator, `\r`, and `\Xdd…\` the characters its bytes, named by pairs of hexadecimal digits, encode in UTF-8. A formatting command (`\H\`, `\N\`, `\.sp 2\`, …), a locally defined sequence (`\Z…\`), a character set switch (`\Cxxyy\`, `\Mxxyyzz\`), any other sequence, an `\X…\` whose content is not pairs of hexadecimal digits or whose bytes are not UTF-8, and an escape character without a closing one stay as they are.

- `value` (`string`) — the value as it is on the wire.
- `delimiters` (`Delimiters`) — the delimiters of the message.

Returns the decoded `string`.

```typescript
import { decodeEscapes, DEFAULT_DELIMITERS } from "@glion/utils";

decodeEscapes("DOE\\T\\SMITH", DEFAULT_DELIMITERS); // "DOE&SMITH"
```

### `encodeEscapes(value, delimiters)`

The value `value` takes on the wire. The field, component, repetition, subcomponent, and escape delimiters are written as `\F\`, `\S\`, `\R\`, `\T\`, and `\E\`, the segment terminator, `\r`, as `\.br\`, and any other character below U+0020 as `\Xdd\`. A character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, is written as `\Xdd\`, the hexadecimal escape of its UTF-8 bytes, with a digit `A`–`F` in lowercase when its uppercase form is a delimiter. A formatting command (`\H\`, `\N\`, `\.sp 2\`, `\.in+4\`, …), a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`) are written as they are. The encoded value holds no field, component, repetition, or subcomponent delimiter, and no segment terminator, and `decodeEscapes(encodeEscapes(value, d), d)` is `value`.

- `value` (`string`) — the value to write.
- `delimiters` (`Delimiters`) — the delimiters of the message.

Returns the encoded `string`. Throws `EscapeSequenceError` when a character must be escaped and every escape sequence that writes it holds a delimiter.

```typescript
import { encodeEscapes, DEFAULT_DELIMITERS } from "@glion/utils";

encodeEscapes("DOE&SMITH", DEFAULT_DELIMITERS); // "DOE\\T\\SMITH"
```

### `EscapeSequenceError`

Thrown by `encodeEscapes` for a character no escape sequence can write. `character` holds the character and `delimiters` the delimiters it was written with.

```typescript
import { encodeEscapes } from "@glion/utils";

const delimiters = {
  component: "S",
  escape: "\\",
  field: "X",
  repetition: "~",
  subcomponent: "&",
};

encodeEscapes("S", delimiters); // throws EscapeSequenceError
```

### `DEFAULT_DELIMITERS` and `SEGMENT_TERMINATOR`

`DEFAULT_DELIMITERS` holds the delimiters MSH-1 and MSH-2 declare by default: `|` (field), `^` (component), `~` (repetition), `\` (escape), and `&` (subcomponent). `SEGMENT_TERMINATOR` is `\r`, the carriage return that ends every segment. HL7v2 fixes it, so it is not one of the delimiters a message declares.

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

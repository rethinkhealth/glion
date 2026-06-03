# @glion/lint-charset

Lint rule that checks an HL7v2 message's `MSH-18` character set is an allowed encoding (UTF-8 by default).

## What it does

Reads every repetition of `MSH-18` (Character Set) from the tree and checks each declared value against an allow-list. By default only UTF-8 and its strict 7-bit subsets are accepted — `UNICODE UTF-8`, `ASCII`, and `ISO IR6` — the [HL7 table 0211](https://hl7-definition.caristix.com/v2/HL7v2.7.1/Tables/0211) character-set codes that decode identically as UTF-8, the single encoding the Glion runtime supports today (see [`@glion/util-charset`](../util-charset#readme), issue [#662](https://github.com/rethinkhealth/glion/issues/662)).

`MSH-18` is optional and repeating. An absent or empty field implies the ASCII default, which is UTF-8-compatible, so it passes. When the field repeats (`UNICODE UTF-8~8859/1`), each repetition is checked and every incompatible one is reported separately. Comparison is case-insensitive after trimming.

Registered at `error` severity in [`@glion/preset-lint-recommended`](../preset-lint-recommended#readme), a violation becomes a fatal message — which a server can turn into a hard rejection of the inbound message (see [`@glion/mllp-charset`](../mllp-charset#readme)).

## Install

```bash
npm install @glion/lint-charset
```

## Use

```typescript
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintCharset from "@glion/lint-charset";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5|||||||8859/1";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintCharset, { allow: ["UNICODE UTF-8", "ASCII", "ISO IR6"] })
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintCharset[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

export interface CharsetLintOptions {
  /**
   * MSH-18 character-set identifiers (HL7 table 0211) to accept, matched
   * case-insensitively after trimming. An empty list falls back to the
   * default. Default: `["UNICODE UTF-8", "ASCII", "ISO IR6"]`.
   */
  allow?: readonly string[];
}

declare const hl7v2LintCharset: Plugin<[CharsetLintOptions?], Root>;
export default hl7v2LintCharset;
```

The package also exports the constants a consumer needs to match this rule's
diagnostics without coupling to the origin string:

- `CHARSET_RULE_ID` (`"charset"`) — the emitted `ruleId`.
- `HL7V2_LINT_SOURCE` (`"hl7v2-lint"`) — the emitted `source`.
- `DEFAULT_ALLOWED_CHARSETS` — the default allow-list.

## What it checks

Every `MSH-18` repetition must be present in the allow-list (case-insensitive, trimmed), or be empty (the ASCII default).

### Valid

`MSH-18` is `UNICODE UTF-8`:

```hl7
MSH|^~\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5|||||||UNICODE UTF-8
```

`MSH-18` is omitted (implies the ASCII default):

```hl7
MSH|^~\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5
```

### Invalid

`MSH-18` is `8859/1`, which is not byte-compatible with UTF-8:

```hl7
MSH|^~\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5|||||||8859/1
```

Reported message:

```
MSH-18 (character set) value '8859/1' is not allowed (allowed: UNICODE UTF-8, ASCII, ISO IR6)
```

`MSH-18` repeats with one incompatible value (`UNICODE UTF-8~UNICODE UTF-16`) — only the offending repetition is reported:

```
MSH-18 (character set) value 'UNICODE UTF-16' is not allowed (allowed: UNICODE UTF-8, ASCII, ISO IR6)
```

## Part of Glion

`@glion/lint-charset` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

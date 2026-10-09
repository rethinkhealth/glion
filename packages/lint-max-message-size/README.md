# @glion/lint-max-message-size

Lint rule that flags HL7v2 messages exceeding a maximum byte size or segment count.

## What it does

Measures the UTF-8 byte length of the source message and, optionally, the number of segment nodes in the tree. Reports a warning when the message is larger than `maxBytes` (default 10,000,000) or when `maxSegments` is set and the tree contains more segments than allowed. Intended to protect downstream systems from oversized payloads that would cause resource or protocol limits to be hit.

## Install

```bash
npm install @glion/lint-max-message-size
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintMaxMessageSize from "@glion/lint-max-message-size";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintMaxMessageSize, { maxBytes: 1_000_000, maxSegments: 100 })
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintMaxMessageSize[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

export interface MaxMessageSizeOptions {
  /** Max allowed size of the source message in UTF-8 bytes. Default: 10_000_000 (10MB). */
  maxBytes?: number;
  /** Max allowed number of `segment` nodes. Default: undefined (disabled). */
  maxSegments?: number;
}

declare const hl7v2LintMaxMessageSize: Plugin<[MaxMessageSizeOptions?], Root>;
export default hl7v2LintMaxMessageSize;
```

## What it checks

The message's UTF-8 byte length must not exceed `maxBytes`, and (when configured) the number of `segment` nodes must not exceed `maxSegments`.

### Valid

A small message with `maxBytes: 1_000_000` (well under the limit):

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

### Invalid

A message whose UTF-8 size exceeds `maxBytes`:

```
The message is 2000000 bytes; the configured limit is 1000000 bytes. Shorten the message or raise `maxBytes`.
```

A tree with more segments than `maxSegments`:

```
The message has 150 segments; the configured limit is 100 segments. Remove segments or raise `maxSegments`.
```

Each report sets `actual` to the byte or segment count. Both checks are independent — if the message violates both thresholds, two messages are reported.

## Part of Glion

`@glion/lint-max-message-size` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

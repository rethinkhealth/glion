# @glion/lint-required-message-header

Lint rule that requires the message header segment (`MSH`) to be the first segment of an HL7v2 message.

## What it does

Walks the parsed tree and checks that the first `segment` node is named `MSH`. If a different segment appears first, the rule reports one message naming that segment; if the message has no segments, it reports the message as empty. HL7v2 messages must begin with `MSH` because it carries the metadata required for routing and interpretation.

## Install

```bash
npm install @glion/lint-required-message-header
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintRequiredMessageHeader from "@glion/lint-required-message-header";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintRequiredMessageHeader)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintRequiredMessageHeader)`

A `unified` lint rule plugin. Takes no options.

The plugin visits the tree and finds the first `segment` node (descending through any nested groups). If it is not named `MSH`, or the tree has no segments, the plugin reports a message. The message's severity is the one the rule is configured with; it does not throw.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintRequiredMessageHeader: Plugin<[], Root>;
export default hl7v2LintRequiredMessageHeader;
```

## What it checks

The message must have at least one segment, and the first must be `MSH`.

### Valid

`MSH` comes first, followed by any other segments:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
OBX|1|TX|...
```

### Invalid

A non-`MSH` segment appears first:

```hl7
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
The first segment is `PID`; a message must start with the message header segment (`MSH`).
```

A segment with an empty Segment ID first, such as an input that starts with the field separator:

```hl7
|A|B
```

Reported message:

```
The first segment has an empty Segment ID; a message must start with the message header segment (`MSH`).
```

An empty input (`""`), which parses to a tree with no segments, is reported as:

```
The message has no segments; it must start with the message header segment (`MSH`).
```

The rule reports at most one message per tree. Each message sets `expected` to `['MSH']` and, when the message has a first segment, `actual` to its Segment ID.

## Part of Glion

`@glion/lint-required-message-header` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

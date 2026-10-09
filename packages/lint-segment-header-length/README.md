# @glion/lint-segment-header-length

Lint rule that flags HL7v2 segment headers whose name is not exactly three characters.

## What it does

Visits every `segment` node and checks that `node.name.length === 3`. HL7v2 segments are identified by a three-character code (`MSH`, `PID`, `OBX`, `ZAD`). Lengths other than three usually indicate a typo (`PID1`, `MS`, `Obx`), malformed input, or a miscoded private extension.

## Install

```bash
npm install @glion/lint-segment-header-length
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintSegmentHeaderLength from "@glion/lint-segment-header-length";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintSegmentHeaderLength)
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintSegmentHeaderLength)`

A `unified` lint rule plugin. Takes no options.

Visits every `segment` node and reports one message per segment whose Segment ID is not three characters long, with `actual` set to the Segment ID.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2LintSegmentHeaderLength: Plugin<[], Root>;
export default hl7v2LintSegmentHeaderLength;
```

## What it checks

Each segment name must be exactly three characters long.

### Valid

All segments have three-character names:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
OBX|1|TX|...
```

### Invalid

A four-character segment name:

```hl7
PID1|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
The Segment ID `PID1` is 4 characters long; a Segment ID must be exactly 3 characters.
```

A two-character segment name:

```hl7
MS|^~\&|...
```

Reported message:

```
The Segment ID `MS` is 2 characters long; a Segment ID must be exactly 3 characters.
```

A segment with an empty Segment ID, such as a line that starts with the field separator, is reported as:

```
The segment has an empty Segment ID; a Segment ID must be exactly 3 characters.
```

One message is reported per offending segment.

## Part of Glion

`@glion/lint-segment-header-length` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

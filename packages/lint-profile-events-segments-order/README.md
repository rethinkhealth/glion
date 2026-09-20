# @glion/lint-profile-events-segments-order

Lint rule that validates HL7v2 segment order against the message structure defined by the profile.

## What it does

Walks the parsed tree segment-by-segment, feeding each segment name to a runner over the message structure from `@glion/profiles`. Reports one message for the first segment that is not valid at its position, or for a message that ends before the structure is complete. When no `definition` is given, the rule resolves the structure from MSH-9 and MSH-12.

## Install

```bash
npm install @glion/lint-profile-events-segments-order
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintSegmentOrder from "@glion/lint-profile-events-segments-order";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "EVN|A01|20250601120000",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F",
].join("\r");

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintSegmentOrder)
  .process(message);

console.error(reporter([file]));
```

With a message structure of your own:

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-events-segments-order";
import type { MessageStructure } from "@glion/profiles";
import { unified } from "unified";

const ADT_A01_SITE: MessageStructure = {
  id: "ADT_A01_SITE",
  elements: [
    { type: "segment", name: "MSH", optional: false, repeating: false },
    { type: "segment", name: "EVN", optional: false, repeating: false },
    { type: "segment", name: "PID", optional: false, repeating: false },
    { type: "segment", name: "ZPD", optional: true, repeating: false },
  ],
};

const processor = unified().use(hl7v2LintSegmentOrder, {
  definition: ADT_A01_SITE,
});
```

With a structure chosen per message:

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-events-segments-order";
import { loadMessageStructure } from "@glion/profiles";
import { value } from "@glion/util-query";
import { unified } from "unified";

const processor = unified().use(hl7v2LintSegmentOrder, {
  definition: ({ tree }) =>
    value(tree, "MSH-4")?.value === "SITE_A"
      ? ADT_A01_SITE
      : loadMessageStructure(tree),
});
```

## API

### `unified().use(hl7v2LintSegmentOrder[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";
import type { MessageStructure } from "@glion/profiles";
import type { VFile } from "vfile";

export interface SegmentOrderContext {
  tree: Root;
  file: VFile;
}

export interface SegmentOrderOptions {
  /**
   * The message structure to validate against, or a function that returns the
   * one to use for a message. Default: the structure MSH-9 names.
   *
   * When the function returns `undefined`, the rule reports nothing for that
   * message.
   */
  definition?:
    | MessageStructure
    | ((
        context: SegmentOrderContext
      ) =>
        | MessageStructure
        | undefined
        | Promise<MessageStructure | undefined>);
}

declare const hl7v2LintSegmentOrder: Plugin<[SegmentOrderOptions?], Root>;
export default hl7v2LintSegmentOrder;
```

All messages use `ruleId: "segment-order"` and `source: "hl7v2-lint"`. The rule reports at most one order error per message: the first segment the structure does not allow.

## What it checks

Segments must appear in an order the message structure allows, and the message must include every segment the structure requires.

### Valid

An `ADT_A01` message whose segments follow the structure defined for v2.5:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20250601120000
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
PV1|1|I|WARD^101^1
```

### Invalid — unexpected segment

`PID` appears before `EVN` in an `ADT_A01`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
Unexpected segment 'PID'. Expected: EVN, SFT
```

The offending segment name and the segments valid at that position, sorted, are interpolated.

### Invalid — message ended prematurely

All segments were consumed but the structure still requires more; an `ADT_A01` needs a `PV1`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20250601120000
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported message:

```
Message ended prematurely. Expected: NK1, PD1, PV1, ROL
```

The list is the segments valid after the last one, sorted. Only reported when no other validation error was emitted.

### Invalid — empty segment name

A `segment` node in the AST has an empty or undefined `name`:

```
Segment has empty segment name at this position
```

Indicates a malformed tree.

### No structure

When no `definition` is given and MSH-9 and MSH-12 do not name a bundled structure, or when a `definition` function returns `undefined`, the rule reports nothing.

## Part of Glion

`@glion/lint-profile-events-segments-order` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

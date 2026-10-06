# @glion/lint-profile-segment-order

Lint rule that validates HL7v2 segment order against the event schema defined by the profile.

## What it does

Walks the parsed tree segment-by-segment, feeding each segment name to a runner over the event schema from `@glion/profiles`. Reports one message for the first segment that is not valid at its position, or for a message that ends before the schema is complete. When no `definition` is given, the rule resolves the schema from MSH-9 and MSH-12.

## Install

```bash
npm install @glion/lint-profile-segment-order
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
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

With an event schema of your own:

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import type { EventSchema } from "@glion/profiles";
import { unified } from "unified";

const ADT_A01_SITE: EventSchema = {
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

With a schema chosen per message, and the one MSH-9 names otherwise:

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import { value } from "@glion/util-query";
import { unified } from "unified";

const processor = unified().use(hl7v2LintSegmentOrder, {
  definition: ({ tree }) =>
    value(tree, "MSH-4")?.value === "SITE_A" ? ADT_A01_SITE : undefined,
});
```

Reporting every Z-segment the schema does not name:

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import { unified } from "unified";

const processor = unified().use(hl7v2LintSegmentOrder, {
  allowZSegments: false,
});
```

## API

### `unified().use(hl7v2LintSegmentOrder[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";
import type { EventSchema } from "@glion/profiles";
import type { VFile } from "vfile";

export interface SegmentOrderContext {
  tree: Root;
  file: VFile;
}

export interface SegmentOrderOptions {
  /**
   * The event schema to validate against, or a function that returns the
   * one to use for a message. Default: the schema MSH-9 names.
   *
   * When the function returns `undefined`, the rule uses the schema MSH-9
   * names.
   */
  definition?:
    | EventSchema
    | ((
        context: SegmentOrderContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
  /**
   * Whether a Z-segment (a segment ID that starts with `Z`) that the event
   * schema does not name fits at any position. HL7v2 allows local Z-segments
   * in any message and segment group (v2.5.1 §2.11). When `false`, the rule
   * reports such a segment as unexpected. Default: `true`.
   */
  allowZSegments?: boolean;
}

declare const hl7v2LintSegmentOrder: Plugin<[SegmentOrderOptions?], Root>;
export default hl7v2LintSegmentOrder;
```

All messages use `ruleId: "segment-order"` and `source: "hl7v2-lint"`. The rule reports at most one order error per message: the first segment the schema does not allow.

## What it checks

Segments must appear in an order the event schema allows, and the message must include every segment the schema requires. A Z-segment the schema does not name may appear anywhere, unless `allowZSegments` is `false`; a Z-segment the schema names must appear where the schema allows it.

### Valid

An `ADT_A01` message whose segments follow the schema defined for v2.5:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20250601120000
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
PV1|1|I|WARD^101^1
```

The same message with a site's Z-segment, which the schema does not name:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20250601120000
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
ZPD|1|site patient data
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

All segments were consumed but the schema still requires more; an `ADT_A01` needs a `PV1`:

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

### No schema

When no `definition` is given, or a `definition` function returns `undefined`, the rule uses the schema MSH-9 and MSH-12 name; when they name no bundled schema, it reports nothing.

## Part of Glion

`@glion/lint-profile-segment-order` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

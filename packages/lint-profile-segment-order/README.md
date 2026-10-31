# @glion/lint-profile-segment-order

Lint rule that validates HL7v2 segment order against the event schema defined by the profile.

## What it does

Runs the message's segment IDs through the event schema from `@glion/profiles`. When they do not fit, reads the message as the one the schema accepts with the fewest edits and reports each edit: a segment the schema requires and the message does not have, or a segment the message has and the schema does not allow there. When no `definition` is given, the rule resolves the schema from MSH-9 and MSH-12.

## Install

```bash
npm install @glion/lint-profile-segment-order
```

## Use

```ts
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { reporter } from "vfile-reporter";

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
  "EVN|A01|20250601120000\r",
  "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F\r",
].join("");

const file = new VFile();
await unified().use(hl7v2LintSegmentOrder).run(parseHL7v2(message), file);

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
    value(tree, "MSH.4")?.value === "SITE_A" ? ADT_A01_SITE : undefined,
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
   * names. Return the same object for every message that uses a schema: a
   * new object is compiled on its first run.
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

All messages use `ruleId: "segment-order"` and `source: "hl7v2-lint"`. The rule reports each edit of the repair with the fewest edits, as `repair` in `@glion/profiles` finds it. A missing segment's message names the segment groups it belongs in, and has `place` a point, where the segment would be inserted, `ancestors` the nodes that hold that point, and `expected` the segment ID. A slot the schema fills with any segment (`Hxx`) or any Z-segment (`anyZSegment`) is described in words and has no `expected`. An unexpected segment's message describes the segment without naming it, and has `place` the segment's position, `ancestors` the segment and its ancestors, and `actual` the segment ID.

The rule reports at most 20 edits for a message, or 21 when the 21st is the out-of-place segment standing where the 20th, a missing one, belongs, then one message with the count of the rest. A message of more than 1,000 segments is not repaired: the rule reports the first segment that does not fit, with `actual` its ID and `expected` the segment IDs valid there, or, when the message ends early, the end of the message with `expected` the segment IDs valid next. Its `note` says why only that one is reported.

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

### Invalid — missing segment

An `ORU_R01` order with results and no `OBR`:

```hl7
MSH|^~\&|LAB|FAC|EMR|RFAC|20250601120000||ORU^R01^ORU_R01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
OBX|1|NM|WBC||5.0
OBX|2|NM|RBC||4.5
```

Reported message:

```
Segment `OBR` of segment group `PATIENT_RESULT > ORDER_OBSERVATION` is missing; the event schema requires it at this point.
```

A missing segment is reported at the start of the segment it comes before, with the IDs of the segment groups it belongs in, outermost first.

### Invalid — more than one missing segment

An `ADT_A01` without its `EVN` and its `PV1`:

```hl7
MSH|^~\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
```

Reported messages:

```
Segment `EVN` is missing; the event schema requires it at this point.
Segment `PV1` is missing; the event schema requires it at this point.
```

A segment missing at the end of the message is reported at the end of the message.

### Invalid — unexpected segment

`DSC` ends an `ORU_R01`, so no segment may follow it:

```hl7
MSH|^~\&|LAB|FAC|EMR|RFAC|20250601120000||ORU^R01^ORU_R01|MSG00001|P|2.5
PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F
OBR|1|ORD1||CBC
OBX|1|NM|WBC||5.0
DSC|1
PID|2||PATID5678^^^HOSP^MR||DOE^JOHN||19750101|M
```

Reported message:

```
The segment is out of place; the event schema does not allow it at this point.
```

An unexpected segment is reported on itself. A segment in place of a required one is reported as unexpected, and the required one as missing.

### Which edits

Of the repairs with the fewest edits, the rule reports one with the fewest unexpected segments: in `ORU_R01`, `MSH PID OBR OBX ORC OBX` reports `OBR` missing before the last `OBX`, not `ORC` out of place.

### No schema

When no `definition` is given, or a `definition` function returns `undefined`, the rule uses the schema MSH-9 and MSH-12 name; when they name no bundled schema, it reports nothing.

## Part of Glion

`@glion/lint-profile-segment-order` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

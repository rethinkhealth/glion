# @glion/lint-profile-segment-order

Lint rule that validates HL7v2 segment order against the message structure defined by the profile.

## What it does

Walks the parsed tree segment-by-segment, feeding each segment name into a DFA (Deterministic Finite Automaton) built from the message structure definition in `@glion/profiles`. Reports one message for the first segment that is not valid at its position, or for a message that ends before reaching an accepting state. When no explicit `definition` is given, the rule resolves one from `tree.data.messageInfo` or directly from `MSH-9.3` and `MSH-12`.

## Install

```bash
npm install @glion/lint-profile-segment-order
```

## Use

```ts
import { hl7v2AnnotateMessage } from "@glion/annotate-message";
import { hl7v2AnnotateMessageStructure } from "@glion/annotate-message-structure";
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
  .use(hl7v2AnnotateMessage)
  .use(hl7v2AnnotateMessageStructure)
  .use(hl7v2LintSegmentOrder)
  .process(message);

console.error(reporter([file]));
```

With an explicit DFA definition (skips automatic resolution):

```ts
import { profiles } from "@glion/profiles";
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import { unified } from "unified";

const definition = await profiles.events.load("2.5", "ADT_A01");

const processor = unified().use(hl7v2LintSegmentOrder, { definition });
```

## API

### `unified().use(hl7v2LintSegmentOrder[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";
import type { Definition } from "@glion/profiles";

export interface SegmentOrderOptions {
  /**
   * Pre-loaded DFA definition for the message structure. When provided, the
   * rule uses it directly and skips automatic resolution from tree metadata
   * or MSH fields.
   */
  definition?: Definition;
}

declare const hl7v2LintSegmentOrder: Plugin<[SegmentOrderOptions?], Root>;
export default hl7v2LintSegmentOrder;
```

All messages use `ruleId: "segment-order"` and `source: "hl7v2-lint"`. The rule stops at the first error because a rejected DFA transition leaves the automaton in an undefined state, and subsequent errors would be misleading.

## What it checks

Segments must appear in an order that the message structure DFA accepts, and the message must end in an accepting state. The rule also surfaces two resolution errors that prevent validation from running.

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

The offending segment name and the set of segments the DFA expected at that position are interpolated.

### Invalid — message ended prematurely

All segments were consumed but the DFA did not reach an accepting state:

```
Message ended prematurely. Expected: PV1, PV2
```

The list is the set of segments that would have satisfied the accepting state from the current position. Only reported when no other validation error was emitted.

### Invalid — empty segment name

A `segment` node in the AST has an empty or undefined `name`:

```
Segment has empty segment name at this position
```

Indicates a malformed tree.

### Resolution — missing metadata

Neither `tree.data.messageInfo` nor the MSH fields yield the version and message structure:

```
Cannot validate segment order: missing version (MSH-12) or message structure (MSH-9.3)
```

### Resolution — profile not found

The version and structure were resolved, but no matching profile definition exists:

```
Cannot validate segment order: no profile found for ZZZ_Z99 (v2.5)
```

Resolution errors cause validation to be skipped entirely.

## Part of Glion

`@glion/lint-profile-segment-order` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

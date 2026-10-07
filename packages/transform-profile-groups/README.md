# @glion/transform-profile-groups

Unified plugin that nests HL7v2 segments in the segment groups their event schema defines.

## What it does

The parser produces a flat list of segments. This plugin nests them in `Group` nodes the way the HL7v2 standard defines the event's message structure: in an `ORU_R01`, each order's `OBR` and its results go in an `ORDER_OBSERVATION`, inside a `PATIENT_RESULT`. It reads the event schema MSH-12 and MSH-9 name and moves the existing segment nodes; it does not copy or change them.

## Install

```bash
npm install @glion/transform-profile-groups
```

## Use

```ts
import { parseHL7v2 } from "@glion/parser";
import { hl7v2TransformProfileGroups } from "@glion/transform-profile-groups";
import { unified } from "unified";
import { VFile } from "vfile";

const tree = parseHL7v2(
  [
    "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG1|P|2.5",
    "PID|1||12345^^^MRN||Doe^John",
    "PV1|1|I",
    "ORC|RE|ORD1",
    "OBR|1|ORD1||CBC",
    "OBX|1|NM|WBC||5.0",
    "OBX|2|NM|RBC||4.1",
  ].join("\r")
);

await unified().use(hl7v2TransformProfileGroups).run(tree, new VFile());
```

The root now holds:

```
MSH
PATIENT_RESULT
  PATIENT
    PID
    VISIT
      PV1
  ORDER_OBSERVATION
    ORC
    OBR
    OBSERVATION
      OBX
    OBSERVATION
      OBX
```

Paths from `@glion/util-query` address the groups:

```ts
import { selectAll, value } from "@glion/util-query";

selectAll(tree, "PATIENT_RESULT-ORDER_OBSERVATION"); // each order
value(tree, "PATIENT_RESULT-ORDER_OBSERVATION[1]-OBX[2]-5")?.value; // => "4.1"
```

## Options

| Option           | Type                                                   | Default                | Description                                                                                                                                                 |
| ---------------- | ------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definition`     | `EventSchema \| (context) => EventSchema \| undefined` | the schema MSH-9 names | The event schema to group by, or a function of `{ tree, file }` that returns one, sync or async. `undefined` falls back to the schema MSH-9 names.          |
| `allowZSegments` | `boolean`                                              | `true`                 | Whether a Z-segment the event schema does not name fits at any position, as HL7v2 allows (v2.5.1 §2.11). When `false`, such a segment leaves the tree flat. |

An event schema of your own groups a message the bundled schemas do not define, such as one with a site's Z-segment:

```ts
import type { EventSchema } from "@glion/profiles";

const definition: EventSchema = {
  id: "ZAD_Z01",
  elements: [
    { type: "segment", name: "MSH", optional: false, repeating: false },
    { type: "segment", name: "PID", optional: false, repeating: false },
    {
      type: "group",
      id: "VISIT",
      name: "VISIT",
      optional: false,
      repeating: false,
      elements: [
        { type: "segment", name: "PV1", optional: false, repeating: false },
        { type: "segment", name: "ZPV", optional: true, repeating: false },
      ],
    },
  ],
};

await unified()
  .use(hl7v2TransformProfileGroups, { definition })
  .run(tree, new VFile());
// MSH, PID, VISIT(PV1, ZPV)
```

## API

### `unified().use(hl7v2TransformProfileGroups[, options])`

Replaces the root's segments with nested `Group` nodes holding the same segment nodes, in the same order.

```ts
import type { Root } from "@glion/ast";
import type { EventSchema } from "@glion/profiles";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

interface TransformProfileGroupsContext {
  tree: Root;
  file: VFile;
}

interface TransformProfileGroupsOptions {
  definition?:
    | EventSchema
    | ((
        context: TransformProfileGroupsContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
  allowZSegments?: boolean;
}

declare const hl7v2TransformProfileGroups: Plugin<
  [TransformProfileGroupsOptions?],
  Root,
  Root
>;
export default hl7v2TransformProfileGroups;
```

###### Requires

Without `options.definition`: a message whose MSH-12 and MSH-9 name a bundled event schema. MSH-9.3 names the schema; when it is empty, MSH-9.1 and MSH-9.2 name the event, and the version's event map gives its schema.

###### Returns

Async transformer. Mutates the tree in place and returns it.

###### Throws

When the event schema is invalid: it has no elements, a segment has no name, a group has no ID, no name, or no elements, a choice has no alternatives, or a choice alternative can match no segment. When a bundled event schema fails to load.

## Behavior

- Each `Group` has `type: "group"`, the group's `id`, such as `ORDER_OBSERVATION` or `PATIENT_VISIT`, its `name` as the standard spells it, such as `ORDER_OBSERVATION` or `PATIENT VISIT`, and a `position` from the start of its first segment to the end of its last.
- Each occurrence of a repeating group is its own `Group` node: two results give two `OBSERVATION` nodes.
- A choice, the standard's `< OBR | RXO >`, adds no node: the chosen segment sits in the enclosing group.
- A group occurrence that holds no segment is left out.
- Where the schema admits more than one grouping, the plugin enters an optional element rather than skip it, repeats an element rather than leave it, and takes the earlier alternative of a choice. A segment therefore continues the group it is in before it starts a new enclosing one: in an `ORU_R01`, an `ORC` after an `OBX` starts a new `ORDER_OBSERVATION` in the current `PATIENT_RESULT`.
- A Z-segment, a segment ID that starts with `Z`, that the schema does not name goes right after the segment before it, in that segment's group: in an `ORU_R01`, a `ZPI` after the `PID` sits in `PATIENT`, and a `ZDS` after the `OBR` in `ORDER_OBSERVATION`. Consecutive Z-segments stay together, in order, and a Z-segment before every segment the schema names stays at the top level. A Z-segment the schema names is placed where the schema puts it. With `allowZSegments: false`, a Z-segment the schema does not name leaves the tree flat.
- A tree that already holds a group, from a first run or from another plugin, is left as it is, and `definition` is not called for it.
- The tree is also left unchanged when there is no event schema, or when the segments do not fit the schema: a segment out of order, a required segment missing, or a segment the schema does not define that is not a Z-segment. `@glion/lint-profile-segment-order` reports those messages.
- Running it twice changes nothing.

Grouping changes neither serialization nor segment paths: `toHl7v2` writes the same text, and `value(tree, "PID-3.1")` and `value(tree, "OBX[2]-5")` resolve the same nodes. Profile annotation and lint plugins read segments at any depth, so they run before or after it.

## Part of Glion

`@glion/transform-profile-groups` is part of **[Glion]**, the application framework for HL7v2.
See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

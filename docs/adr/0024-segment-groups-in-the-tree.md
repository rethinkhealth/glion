# ADR 0024: Segment Groups in the Tree

## Status

Proposed (2026-10-06)

Builds on ADR 0023, whose runner returns a message's segments nested in the groups its event schema defines.

## Context

The parser produces a flat list of segments. An HL7v2 event schema nests them: in `ORU_R01`, each order's `OBR` and its `OBX` results belong to an `ORDER_OBSERVATION`, inside a `PATIENT_RESULT`. A consumer that reads "the second order's results" needs the nesting in the tree. `@glion/ast` defines `Group`, `@glion/util-query` resolves group paths, `@glion/to-hl7v2` and `@glion/jsonify` read groups, and the runner computes them, but nothing puts them in a parsed tree.

Two facts constrain how groups get there:

- **Messages do not always fit.** Sites add Z-segments, the segment IDs HL7v2 reserves for local definition, which Chapter 2 allows in any message and inside any segment group (§2.11.1, §2.11.3), and senders misplace segments or omit required ones. A grouping step must decide what to do with a message the schema rejects.
- **One fact, one owner.** Whether a message's segments fit its schema is `lint-profile-segment-order`'s fact (CONTRIBUTING, Lint Rules). A grouping step that reports misfits, or a group rule that re-checks them, would report that fact a second time.

Other toolkits answer the first question in three ways. HAPI and nHapi always build a tree: by default they put an unknown segment in the current group, right after the segment before it, and a misplaced standard segment either jumps forward or becomes a non-standard segment, after which every later segment can land at the root. hl7apy and Iguana drop segments they do not know. Mirth keeps the tree flat. None reports group facts apart from order facts unless a conformance profile adds usage and cardinality to its groups; NIST's validator then reports "the required X is missing" and "X must be in the cardinality range of [min, max]" apart from "segment X is not expected at this location".

## Decision

1. **Grouping is a transform, `@glion/transform-profile-groups`, and it is opt-in.** It runs the runner over the root's segments and replaces them with nested `Group` nodes holding the same segment nodes, in the same order. A group's position spans its first to its last segment. No preset includes it: it changes what `@glion/jsonify` emits, and path addressing across depths is still open (#724).

2. **Schema selection mirrors the segment-order lint.** The `definition` option is an `EventSchema` or a function of `{ tree, file }` that returns one; `undefined` falls back to the schema MSH-12 and MSH-9 name, resolved as the lint resolves it. The transform and the lint therefore group and validate by the same schema.

3. **A message either fits or stays flat.** The transform groups a message only when the runner matches its segments. A segment out of order, a missing required segment, or a segment the schema does not name leaves the tree flat. A Z-segment the schema does not name fits, as §2.11 allows: the runner accepts it and places it right after the segment before it, in that segment's group (ADR 0023, decision 7), and the transform passes `allowZSegments` through, as the segment-order lint does, so `false` leaves such a message flat. The transform reports nothing; the segment-order lint reports the first segment that does not fit. A minimum-edit repair of a message that does not fit would widen what fits without changing this rule (#869).

4. **Plugins read groups at any depth.** The lint rules, the profile annotators, and the serializer visit segments wherever they sit, so the transform can run before or after them. QR6 in `qa/` holds them to it: on the same message, flat and grouped trees give the same diagnostics, the same annotations, and the same text, over the qa fixtures and over messages generated to fit each v2.5 event schema.

5. **Group lint rules wait for group constraints.** Under the base standard a group has only `optional` and `repeating`, and the runner checks both with segment order in one pass, so "a required group is missing" and "a group repeats" are cases of the segment-order fact. A group rule earns its place once a profile constrains groups beyond the standard, with usage and minimum and maximum cardinality (#840). Such a rule reads the `Group` nodes the transform builds.

## Consequences

- A message that fits its schema can be addressed by group: `PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX-5`. That needed `@glion/util-query` to accept `_` in names (#865); 209 of the 267 bundled group names hold one.
- Grouping costs about 0.7 µs per segment: 68 µs for a 102-segment `ORU_R01` (`transform-profile-groups` suite). With the segment-order lint in the same pipeline, the runner runs once more.
- A message with any misfit stays flat, so its consumers fall back to document-order paths (`OBX[3]`), which resolve the same on flat and grouped trees.
- Group names come from the XML schemas. Twelve v2.6 names held a space or a `/`; the generator spells them with `_`, as v2.5.1 and v2.7 do, and the event schema JSON Schema requires `[A-Z][A-Z0-9_]*` (#866). 18 names are XSD inventions for groups the standard leaves unnamed, such as `OBXNTE_SUPPGRP`; they are data defects, for the generator to fix.

## Alternatives considered

- **Place Z-segments in the transform**, by running again without the Z-segments the schema does not name and putting each right after the segment before it, in that segment's group. The transform would then group messages the segment-order lint reports, and the two would read one message two ways. The runner accepts them instead, for every caller (#868).
- **Place every misfit, as HAPI does.** A tree for every message, but a misplaced standard segment has no right place, and HAPI's forward-only placement sends every later segment to the root. A minimum-edit repair places misfits without that cascade and changes the segment-order lint's report (#869).
- **Drop segments the schema does not define**, as hl7apy and Iguana do. Loses data without a report.
- **Group in the parser.** The parser would need the profiles, and every consumer would pay for grouping and get the `jsonify` shape change.
- **Report from the transform when it cannot group.** The segment-order lint owns that fact.

## Related

ADR 0023 (event schemas, one engine); #724 (child vs descendant addressing), #727 (the grouping plugin, superseded), #840 (conformance profiles), #865, #866, #867, #868 (Z-segments in the runner), #869 (minimum-edit repair).

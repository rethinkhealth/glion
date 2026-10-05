---
"@glion/profiles": minor
"@glion/lint-profile-segment-order": minor
"@glion/preset-lint-profile-recommended": patch
---

Event schemas are the bundled data, and one engine validates segment order and groups segments.

Each bundled event schema is a JSON file holding the schema as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `EventSchema`. `runner(schema, segmentIds)` runs a message's segment IDs through its schema in one pass: it returns `matched` with the segment indexes nested in the groups the schema defines, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete` with the segment IDs that can come next.

`@glion/profiles/event-schema.schema.json` is the JSON Schema of an event schema; every bundled schema names it in `$schema` by its `$id`, `https://glion.dev/schemas/event-schema/v1.json`. A schema of your own is plain data of the same shape and works wherever a bundled one does. `runner()` throws for a schema with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

A choice such as ORM*O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-segment-order` no longer reports valid lab and pharmacy orders (#815); 108 schemas change. A segment the schema names elsewhere may fill an `Hxx` position, as in QBP_Q11 (#816); 32 schemas change. Every `xsd:choice` is read as a choice; in 18 chapter 16 and 17 groups (`EHC*\*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`) this differs from HAPI, which reads them as sequences, so an `EHC_E01`invoice that carries more than one of`IVC`, `PYE`, `CTD`, … is reported as out of order until #838 settles what the standard says. The rule's messages are otherwise unchanged.

`lint-profile-segment-order` reports a segment with an empty ID as unexpected, like any segment the schema does not allow, where it reported "Segment has empty segment name".

**Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner(schema, segmentIds)` replaces the stateful runner: it takes a message's segment IDs at once and returns `matched`, `mismatched`, or `incomplete`, and `Runner`, `RunnerState`, `consume()`, `accepted`, `expected`, and the step and invalid events are removed. `lint-profile-segment-order`'s `definition` option takes an `EventSchema`, or a function `({ tree, file }) => EventSchema | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult`. When the function returns `undefined`, the rule uses the schema MSH-9 names. The rule resolves the schema itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

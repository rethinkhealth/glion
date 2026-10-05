---
"@glion/profiles": minor
"@glion/lint-profile-segment-order": minor
"@glion/preset-lint-profile-recommended": patch
---

Event schemas are the bundled data, and one engine validates segment order and groups segments.

Each bundled event schema is a JSON file holding the schema as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `EventSchema`. `runner(schema, segmentIds)` runs a message's segment IDs through its schema in one pass: it returns `matched` with the segment indexes nested in the groups the schema defines, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete` with the segment IDs that can come next.

`loadEventSchema(tree)` returns the schema of the event a message carries, or `undefined` when the version defines none. It reads MSH-12.1 for the version and MSH-9.3, or MSH-9.1 and MSH-9.2 through the event maps, for the schema, and the store caches the result.

`@glion/profiles/event-schema.schema.json` is the JSON Schema of an event schema; every bundled schema names it in `$schema` by its `$id`, `https://glion.dev/schemas/event-schema/v1.json`. A schema of your own is plain data of the same shape and works wherever a bundled one does. `runner()` throws for a schema with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

A choice such as ORM*O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-segment-order` no longer reports valid lab and pharmacy orders (#815); 108 schemas change. A segment the schema names elsewhere may fill an `Hxx` position, as in QBP_Q11 (#816); 32 schemas change. Every `xsd:choice` is read as a choice; in 18 chapter 16 and 17 groups (`EHC*\*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`) this differs from HAPI, which reads them as sequences, so an `EHC_E01`invoice that carries more than one of`IVC`, `PYE`, `CTD`, … is reported as out of order until #838 settles what the standard says. The rule's messages are otherwise unchanged.

A version or schema read from MSH-12 or MSH-9 that names an `Object.prototype` key, such as MSH-9.3 `constructor`, now resolves to no schema; `loadEventSchema` rejected on it, and with it the segment-order rule.

`lint-profile-segment-order` reports a segment with an empty ID as unexpected, like any segment the schema does not allow, where it reported "Segment has empty segment name".

**Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner(schema, segmentIds)` replaces the stateful runner: it takes a message's segment IDs at once and returns `matched`, `mismatched`, or `incomplete`, and `Runner`, `RunnerState`, `consume()`, `accepted`, `expected`, and the step and invalid events are removed. `lint-profile-segment-order`'s `definition` option takes an `EventSchema`, or a function `({ tree, file }) => EventSchema | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult` or `resolveDefinition`; `loadEventSchema` from `@glion/profiles` replaces them. `resolveEventSchema` is removed; `eventMaps` gives the same lookup. The rule resolves the schema itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

**Breaking:** `@glion/lint-profile-events-segments-order` is renamed `@glion/lint-profile-segment-order`, after the `segment-order` rule it reports; the old package is deprecated.

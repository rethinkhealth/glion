---
"@glion/profiles": minor
"@glion/lint-profile-events-segments-order": minor
---

Message structures are the bundled data, and one engine validates segment order and groups segments.

Each bundled message structure is a JSON file holding the structure as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `MessageStructure`. `runner(structure)` validates segment order one segment at a time, with the same `consume`, `accepted`, and `expected` as before; `matchStructure(structure, segmentNames)` returns the segment indexes nested in the groups the structure defines, or `undefined` when the segments do not fit it.

`loadMessageStructure(tree)` returns the structure a message names in MSH-9, or `undefined` when the version defines none. It reads MSH-12.1 for the version and MSH-9.3, or MSH-9.1 and MSH-9.2 through the event maps, for the structure, and the store caches the result.

`@glion/profiles/message-structure.schema.json` is the JSON Schema of a message structure; every bundled structure names it in `$schema` by its `$id`, `https://glion.dev/schemas/message-structure/v1.json`. A structure of your own is plain data of the same shape and works wherever a bundled one does. `runner()` and `matchStructure()` throw for a structure with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

A choice such as ORM_O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-events-segments-order` no longer reports valid lab and pharmacy orders (#815); 108 structures change. A segment the structure names elsewhere may fill an `Hxx` position, as in QBP_Q11 (#816); 32 structures change. The chapter 16 and 17 groups that the HL7 schemas mark as choices but the standard defines as sequences, such as `EHC_E01`'s invoice information, stay sequences. The rule's messages are otherwise unchanged.

**Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner()` takes a `MessageStructure`, and a step event is `{ type: "step" }`. `lint-profile-events-segments-order`'s `definition` option takes a `MessageStructure`, or a function `({ tree, file }) => MessageStructure | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult` or `resolveDefinition`; `loadMessageStructure` from `@glion/profiles` replaces them. The rule resolves the structure itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

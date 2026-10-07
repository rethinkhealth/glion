# @rethinkhealth/hl7v2-lint-profile-events-segments-order

## 0.21.0

### Minor Changes

- [#856](https://github.com/rethinkhealth/glion/pull/856) [`2aae517`](https://github.com/rethinkhealth/glion/commit/2aae517e8d131b4ed0dd1c3b86d9d9783d730b3c) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** `@glion/lint-profile-events-segments-order` is renamed `@glion/lint-profile-segment-order`, after the `segment-order` rule it reports; the old package is deprecated.

- [#870](https://github.com/rethinkhealth/glion/pull/870) [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa) Thanks [@meleksomai](https://github.com/meleksomai)! - The rule no longer reports a Z-segment the event schema does not name, such as a `ZPI` after the `PID` of an `ORU_R01`: HL7v2 allows local Z-segments in any message and segment group (v2.5.1 §2.11). Set the new `allowZSegments` option to `false` to report them as unexpected, as before ([#868](https://github.com/rethinkhealth/glion/issues/868)).

- [#860](https://github.com/rethinkhealth/glion/pull/860) [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74) Thanks [@meleksomai](https://github.com/meleksomai)! - Event schemas are the bundled data, and one engine validates segment order and groups segments.

  Each bundled event schema is a JSON file holding the schema as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `EventSchema`. `runner(schema, segmentIds)` runs a message's segment IDs through its schema in one pass: it returns `matched` with the segment indexes nested in the groups the schema defines, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete` with the segment IDs that can come next.

  `@glion/profiles/event-schema.schema.json` is the JSON Schema of an event schema; every bundled schema names it in `$schema` by its `$id`, `https://glion.dev/schemas/event-schema/v1.json`. A schema of your own is plain data of the same shape and works wherever a bundled one does. `runner()` throws for a schema with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

  A choice such as ORM*O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-segment-order` no longer reports valid lab and pharmacy orders ([#815](https://github.com/rethinkhealth/glion/issues/815)); 108 schemas change. A segment the schema names elsewhere may fill an `Hxx` position, as in QBP_Q11 ([#816](https://github.com/rethinkhealth/glion/issues/816)); 32 schemas change. Every `xsd:choice` is read as a choice; in 18 chapter 16 and 17 groups (`EHC*\*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`) this differs from HAPI, which reads them as sequences, so an `EHC_E01`invoice that carries more than one of`IVC`, `PYE`, `CTD`, … is reported as out of order until [#838](https://github.com/rethinkhealth/glion/issues/838) settles what the standard says. The rule's messages are otherwise unchanged.

  `lint-profile-segment-order` reports a segment with an empty ID as unexpected, like any segment the schema does not allow, where it reported "Segment has empty segment name".

  **Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner(schema, segmentIds)` replaces the stateful runner: it takes a message's segment IDs at once and returns `matched`, `mismatched`, or `incomplete`, and `Runner`, `RunnerState`, `consume()`, `accepted`, `expected`, and the step and invalid events are removed. `lint-profile-segment-order`'s `definition` option takes an `EventSchema`, or a function `({ tree, file }) => EventSchema | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult`. When the function returns `undefined`, the rule uses the schema MSH-9 names. The rule resolves the schema itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

### Patch Changes

- [#858](https://github.com/rethinkhealth/glion/pull/858) [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** a store's `load`, `profiles.eventMaps.load`, and `loadSegments` resolve `undefined` for a version or profile the package does not bundle, where they rejected. They reject only when a bundled profile fails to load.

  `@glion/annotate-profile-context` and `@glion/lint-profile-segment-order` skip a profile the version does not bundle, as before, and no longer swallow a profile that fails to load: the plugin rejects with that error. `@glion/annotate-profile-fields-code-systems` tells an unbundled code system from a failed load by the `undefined` it resolves, not by the error's message.

- Updated dependencies [[`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`07d09ec`](https://github.com/rethinkhealth/glion/commit/07d09ec2c35cfce7dd145a2232ea079600dbd791), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`8ac4236`](https://github.com/rethinkhealth/glion/commit/8ac42365f7c887db980f9da98bbde4f5286593bb), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`e38396e`](https://github.com/rethinkhealth/glion/commit/e38396e9962e203986aa27fc205c3f5bf992d153)]:
  - @glion/profiles@0.21.0
  - @glion/util-query@0.21.0
  - @glion/ast@0.21.0
  - @glion/util-visit@0.21.0

## 0.20.0

### Patch Changes

- [#819](https://github.com/rethinkhealth/glion/pull/819) [`e375eab`](https://github.com/rethinkhealth/glion/commit/e375eabe0c28623e12e0c73ad3636c9e582dad5f) Thanks [@meleksomai](https://github.com/meleksomai)! - Stop descending into fields, components, and subcomponents after checking a segment. Both rules read only segment names and a segment's fields, so the messages they report are unchanged; segments nested in groups are still checked.
- Updated dependencies [[`84ed35f`](https://github.com/rethinkhealth/glion/commit/84ed35fcaccc89dad7b658e7543ce6be792f731a)]:
  - @glion/profiles@0.20.0
  - @glion/util-query@0.20.0
  - @glion/util-visit@0.20.0
  - @glion/ast@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.19.0
  - @glion/profiles@0.19.0
  - @glion/util-query@0.19.0
  - @glion/util-visit@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
- Updated dependencies [5f18700]
  - @glion/ast@0.18.0
  - @glion/profiles@0.18.0
  - @glion/util-query@0.18.0
  - @glion/util-visit@0.18.0

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0
- @glion/profiles@0.17.0
- @glion/util-query@0.17.0
- @glion/util-visit@0.17.0

## 0.16.0

### Minor Changes

- 5e3d97e: Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

  Node 18 reaches end-of-life in April 2026; new code in this repo uses
  Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
  and standardising on a single supported Node line keeps the
  dependency matrix coherent across the monorepo.

  Downstream impact: applications that pin Node 18 will need to upgrade
  to Node 20 or later. Node 20 is itself in active LTS and remains
  supported until April 2026; Node 22 is the current LTS.

### Patch Changes

- Updated dependencies [5e3d97e]
- Updated dependencies [b7bdd6a]
  - @glion/ast@0.16.0
  - @glion/profiles@0.16.0
  - @glion/util-query@0.16.0
  - @glion/util-visit@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/profiles@0.15.3
- @glion/util-query@0.15.3
- @glion/util-visit@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/profiles@0.15.2
- @glion/util-query@0.15.2
- @glion/util-visit@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/profiles@0.15.1
- @glion/util-query@0.15.1
- @glion/util-visit@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [5d2e741]
- Updated dependencies [4af9499]
  - @glion/profiles@0.15.0
  - @glion/ast@0.15.0
  - @glion/util-query@0.15.0
  - @glion/util-visit@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-query@0.14.1
  - @rethinkhealth/hl7v2-util-visit@0.14.1
  - @rethinkhealth/hl7v2-profiles@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [3e2c278]
  - @rethinkhealth/hl7v2-profiles@0.14.0
  - @rethinkhealth/hl7v2-ast@0.14.0
  - @rethinkhealth/hl7v2-util-query@0.14.0
  - @rethinkhealth/hl7v2-util-visit@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [357e5e3]
  - @rethinkhealth/hl7v2-profiles@0.13.2
  - @rethinkhealth/hl7v2-ast@0.13.2
  - @rethinkhealth/hl7v2-util-query@0.13.2
  - @rethinkhealth/hl7v2-util-visit@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-profiles@0.13.1
  - @rethinkhealth/hl7v2-util-query@0.13.1
  - @rethinkhealth/hl7v2-util-visit@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-profiles@0.13.0
  - @rethinkhealth/hl7v2-util-query@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

## 0.12.0

### Minor Changes

- 1ef2a1f: Add `resolveMessageStructure()` utility and remove `hl7v2-lint-message-structure-missing` rule.
  - Add `resolveMessageStructure(version, messageCode, triggerEvent)` to `@rethinkhealth/hl7v2-profiles` for resolving canonical message structure IDs from event maps
  - Resolve message structure from MSH-9.1 + MSH-9.2 via event maps when MSH-9.3 is absent in segment-order linting (wire value wins when present)
  - Remove `hl7v2-lint-message-structure-missing` from `hl7v2-preset-lint-recommended` — it produced false positives for pre-v2.3.1 messages where MSH-9.3 does not exist in the spec

### Patch Changes

- Updated dependencies [1ef2a1f]
  - @rethinkhealth/hl7v2-profiles@0.12.0
  - @rethinkhealth/hl7v2-ast@0.12.0
  - @rethinkhealth/hl7v2-util-query@0.12.0
  - @rethinkhealth/hl7v2-util-visit@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-profiles@0.11.0
- @rethinkhealth/hl7v2-util-query@0.11.0
- @rethinkhealth/hl7v2-util-visit@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies [cacf65e]
  - @rethinkhealth/hl7v2-profiles@0.10.1
  - @rethinkhealth/hl7v2-ast@0.10.1
  - @rethinkhealth/hl7v2-util-query@0.10.1
  - @rethinkhealth/hl7v2-util-visit@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-profiles@0.10.0
- @rethinkhealth/hl7v2-util-query@0.10.0
- @rethinkhealth/hl7v2-util-visit@0.10.0

## 0.9.0

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-profiles@0.9.0
  - @rethinkhealth/hl7v2-util-visit@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [64da535]
  - @rethinkhealth/hl7v2-util-query@0.8.0
  - @rethinkhealth/hl7v2-ast@0.8.0
  - @rethinkhealth/hl7v2-profiles@0.8.0
  - @rethinkhealth/hl7v2-util-visit@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.1
- @rethinkhealth/hl7v2-profiles@0.7.1
- @rethinkhealth/hl7v2-util-query@0.7.1
- @rethinkhealth/hl7v2-util-visit@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.0
- @rethinkhealth/hl7v2-profiles@0.7.0
- @rethinkhealth/hl7v2-util-query@0.7.0
- @rethinkhealth/hl7v2-util-visit@0.7.0

## 0.6.0

### Patch Changes

- 9ad16c0: New lint rule that validates HL7v2 segment order against message structure profiles using the DFA automaton runner.
  - Resolves profile from `tree.data.messageInfo` or MSH-9.3/MSH-12 — no compensation logic
  - Uses `file.message()` for consumer-controlled severity
  - Stops at first invalid segment (DFA cannot recover)
  - Reports empty/undefined segment names as errors
  - Pure `resolveDefinition()` returns a Result type (no side effects)

- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.
- Updated dependencies [f00432e]
- Updated dependencies [07fdace]
- Updated dependencies [7763c22]
- Updated dependencies [0b57ba9]
  - @rethinkhealth/hl7v2-profiles@0.6.0
  - @rethinkhealth/hl7v2-util-query@0.6.0
  - @rethinkhealth/hl7v2-util-visit@0.6.0
  - @rethinkhealth/hl7v2-ast@0.6.0

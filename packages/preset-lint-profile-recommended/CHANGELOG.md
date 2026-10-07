# @rethinkhealth/hl7v2-preset-lint-profile-recommended

## 0.21.0

### Patch Changes

- [#856](https://github.com/rethinkhealth/glion/pull/856) [`2aae517`](https://github.com/rethinkhealth/glion/commit/2aae517e8d131b4ed0dd1c3b86d9d9783d730b3c) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** `@glion/lint-profile-events-segments-order` is renamed `@glion/lint-profile-segment-order`, after the `segment-order` rule it reports; the old package is deprecated.

- [#860](https://github.com/rethinkhealth/glion/pull/860) [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74) Thanks [@meleksomai](https://github.com/meleksomai)! - Event schemas are the bundled data, and one engine validates segment order and groups segments.

  Each bundled event schema is a JSON file holding the schema as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `EventSchema`. `runner(schema, segmentIds)` runs a message's segment IDs through its schema in one pass: it returns `matched` with the segment indexes nested in the groups the schema defines, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete` with the segment IDs that can come next.

  `@glion/profiles/event-schema.schema.json` is the JSON Schema of an event schema; every bundled schema names it in `$schema` by its `$id`, `https://glion.dev/schemas/event-schema/v1.json`. A schema of your own is plain data of the same shape and works wherever a bundled one does. `runner()` throws for a schema with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

  A choice such as ORM*O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-segment-order` no longer reports valid lab and pharmacy orders ([#815](https://github.com/rethinkhealth/glion/issues/815)); 108 schemas change. A segment the schema names elsewhere may fill an `Hxx` position, as in QBP_Q11 ([#816](https://github.com/rethinkhealth/glion/issues/816)); 32 schemas change. Every `xsd:choice` is read as a choice; in 18 chapter 16 and 17 groups (`EHC*\*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`) this differs from HAPI, which reads them as sequences, so an `EHC_E01`invoice that carries more than one of`IVC`, `PYE`, `CTD`, … is reported as out of order until [#838](https://github.com/rethinkhealth/glion/issues/838) settles what the standard says. The rule's messages are otherwise unchanged.

  `lint-profile-segment-order` reports a segment with an empty ID as unexpected, like any segment the schema does not allow, where it reported "Segment has empty segment name".

  **Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner(schema, segmentIds)` replaces the stateful runner: it takes a message's segment IDs at once and returns `matched`, `mismatched`, or `incomplete`, and `Runner`, `RunnerState`, `consume()`, `accepted`, `expected`, and the step and invalid events are removed. `lint-profile-segment-order`'s `definition` option takes an `EventSchema`, or a function `({ tree, file }) => EventSchema | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult`. When the function returns `undefined`, the rule uses the schema MSH-9 names. The rule resolves the schema itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

- Updated dependencies [[`2aae517`](https://github.com/rethinkhealth/glion/commit/2aae517e8d131b4ed0dd1c3b86d9d9783d730b3c), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9)]:
  - @glion/lint-profile-segment-order@0.21.0
  - @glion/annotate-profile-context@0.21.0
  - @glion/lint-profile-required-components@0.21.0
  - @glion/lint-profile-extra-components@0.21.0
  - @glion/lint-profile-extra-fields@0.21.0
  - @glion/lint-profile-field-max-length@0.21.0
  - @glion/lint-profile-field-repetition@0.21.0
  - @glion/lint-profile-required-fields@0.21.0
  - @glion/lint-profile-table-values@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`e375eab`](https://github.com/rethinkhealth/glion/commit/e375eabe0c28623e12e0c73ad3636c9e582dad5f)]:
  - @glion/lint-profile-events-segments-order@0.20.0
  - @glion/lint-profile-required-fields@0.20.0
  - @glion/annotate-profile-context@0.20.0
  - @glion/lint-profile-required-components@0.20.0
  - @glion/lint-profile-extra-components@0.20.0
  - @glion/lint-profile-extra-fields@0.20.0
  - @glion/lint-profile-field-max-length@0.20.0
  - @glion/lint-profile-field-repetition@0.20.0
  - @glion/lint-profile-table-values@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-context@0.19.0
  - @glion/lint-profile-events-segments-order@0.19.0
  - @glion/lint-profile-extra-components@0.19.0
  - @glion/lint-profile-extra-fields@0.19.0
  - @glion/lint-profile-field-max-length@0.19.0
  - @glion/lint-profile-field-repetition@0.19.0
  - @glion/lint-profile-required-components@0.19.0
  - @glion/lint-profile-required-fields@0.19.0
  - @glion/lint-profile-table-values@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
  - @glion/annotate-profile-context@0.18.0
  - @glion/lint-profile-events-segments-order@0.18.0
  - @glion/lint-profile-extra-components@0.18.0
  - @glion/lint-profile-extra-fields@0.18.0
  - @glion/lint-profile-field-max-length@0.18.0
  - @glion/lint-profile-field-repetition@0.18.0
  - @glion/lint-profile-required-components@0.18.0
  - @glion/lint-profile-required-fields@0.18.0
  - @glion/lint-profile-table-values@0.18.0

## 0.17.0

### Patch Changes

- @glion/annotate-profile-context@0.17.0
- @glion/lint-profile-events-segments-order@0.17.0
- @glion/lint-profile-extra-components@0.17.0
- @glion/lint-profile-extra-fields@0.17.0
- @glion/lint-profile-field-max-length@0.17.0
- @glion/lint-profile-field-repetition@0.17.0
- @glion/lint-profile-required-components@0.17.0
- @glion/lint-profile-required-fields@0.17.0
- @glion/lint-profile-table-values@0.17.0

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
  - @glion/annotate-profile-context@0.16.0
  - @glion/lint-profile-events-segments-order@0.16.0
  - @glion/lint-profile-extra-components@0.16.0
  - @glion/lint-profile-extra-fields@0.16.0
  - @glion/lint-profile-field-max-length@0.16.0
  - @glion/lint-profile-field-repetition@0.16.0
  - @glion/lint-profile-required-components@0.16.0
  - @glion/lint-profile-required-fields@0.16.0
  - @glion/lint-profile-table-values@0.16.0

## 0.15.3

### Patch Changes

- @glion/annotate-profile-context@0.15.3
- @glion/lint-profile-events-segments-order@0.15.3
- @glion/lint-profile-extra-components@0.15.3
- @glion/lint-profile-extra-fields@0.15.3
- @glion/lint-profile-field-max-length@0.15.3
- @glion/lint-profile-field-repetition@0.15.3
- @glion/lint-profile-required-components@0.15.3
- @glion/lint-profile-required-fields@0.15.3
- @glion/lint-profile-table-values@0.15.3

## 0.15.2

### Patch Changes

- @glion/annotate-profile-context@0.15.2
- @glion/lint-profile-events-segments-order@0.15.2
- @glion/lint-profile-extra-components@0.15.2
- @glion/lint-profile-extra-fields@0.15.2
- @glion/lint-profile-field-max-length@0.15.2
- @glion/lint-profile-field-repetition@0.15.2
- @glion/lint-profile-required-components@0.15.2
- @glion/lint-profile-required-fields@0.15.2
- @glion/lint-profile-table-values@0.15.2

## 0.15.1

### Patch Changes

- @glion/annotate-profile-context@0.15.1
- @glion/lint-profile-events-segments-order@0.15.1
- @glion/lint-profile-extra-components@0.15.1
- @glion/lint-profile-extra-fields@0.15.1
- @glion/lint-profile-field-max-length@0.15.1
- @glion/lint-profile-field-repetition@0.15.1
- @glion/lint-profile-required-components@0.15.1
- @glion/lint-profile-required-fields@0.15.1
- @glion/lint-profile-table-values@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/annotate-profile-context@0.15.0
  - @glion/lint-profile-events-segments-order@0.15.0
  - @glion/lint-profile-extra-components@0.15.0
  - @glion/lint-profile-extra-fields@0.15.0
  - @glion/lint-profile-field-max-length@0.15.0
  - @glion/lint-profile-field-repetition@0.15.0
  - @glion/lint-profile-required-components@0.15.0
  - @glion/lint-profile-required-fields@0.15.0
  - @glion/lint-profile-table-values@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-context@0.14.1
- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.14.1
- @rethinkhealth/hl7v2-lint-profile-extra-components@0.14.1
- @rethinkhealth/hl7v2-lint-profile-extra-fields@0.14.1
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.14.1
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.14.1
- @rethinkhealth/hl7v2-lint-profile-required-components@0.14.1
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.14.1
- @rethinkhealth/hl7v2-lint-profile-table-values@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [3e2c278]
  - @rethinkhealth/hl7v2-annotate-profile-context@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-extra-components@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-extra-fields@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.14.0
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-context@0.13.2
- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.13.2
- @rethinkhealth/hl7v2-lint-profile-required-components@0.13.2
- @rethinkhealth/hl7v2-lint-profile-extra-components@0.13.2
- @rethinkhealth/hl7v2-lint-profile-extra-fields@0.13.2
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.13.2
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.13.2
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.13.2
- @rethinkhealth/hl7v2-lint-profile-table-values@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-annotate-profile-context@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-extra-components@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-extra-fields@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.13.1
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.13.1

## 0.13.0

### Patch Changes

- f411ebf: Centralize profile loading into a single context plugin

  New package:
  - `@rethinkhealth/hl7v2-annotate-profile-context` — unified plugin that loads all profile data (fields, datatypes, tables) once per pipeline run and attaches them to `file.data.profile` for downstream consumers

  Refactored packages (internal, no API changes):
  - 7 lint rules and 2 annotation plugins now read profiles from `file.data.profile` instead of loading them independently, eliminating duplicated async loading code from 9+ locations
  - Both profile presets include the context plugin as the first entry to ensure `file.data.profile` is populated before consumers run

- Updated dependencies [f411ebf]
  - @rethinkhealth/hl7v2-annotate-profile-context@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-extra-fields@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-extra-components@0.13.0
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.13.0

## 0.12.0

### Minor Changes

- ebb5944: Add extra-fields and extra-components lint rules, fix table-values repetition bug

  New packages:
  - `@rethinkhealth/hl7v2-lint-profile-extra-fields` — warns when a segment has fields beyond the maximum sequence defined in its profile
  - `@rethinkhealth/hl7v2-lint-profile-extra-components` — warns when a composite field has more components than its datatype profile defines

  Bug fix:
  - `@rethinkhealth/hl7v2-lint-profile-table-values` now validates all field repetitions instead of only the first

  Both new rules are included in `@rethinkhealth/hl7v2-preset-lint-profile-recommended`.

### Patch Changes

- Updated dependencies [3d9d88c]
- Updated dependencies [ebb5944]
- Updated dependencies [1ef2a1f]
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-extra-fields@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-extra-components@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.12.0
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.11.0
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.11.0
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.11.0
- @rethinkhealth/hl7v2-lint-profile-required-components@0.11.0
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.11.0
- @rethinkhealth/hl7v2-lint-profile-table-values@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.10.1
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.10.1
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.10.1
- @rethinkhealth/hl7v2-lint-profile-required-components@0.10.1
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.10.1
- @rethinkhealth/hl7v2-lint-profile-table-values@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.10.0
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.10.0
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.10.0
- @rethinkhealth/hl7v2-lint-profile-required-components@0.10.0
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.10.0
- @rethinkhealth/hl7v2-lint-profile-table-values@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.9.0
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.9.0
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.9.0
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.9.0
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.9.0
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.8.0
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.8.0
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.8.0
- @rethinkhealth/hl7v2-lint-profile-required-components@0.8.0
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.8.0
- @rethinkhealth/hl7v2-lint-profile-table-values@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.7.1
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.7.1
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.7.1
- @rethinkhealth/hl7v2-lint-profile-required-components@0.7.1
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.7.1
- @rethinkhealth/hl7v2-lint-profile-table-values@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.7.0
- @rethinkhealth/hl7v2-lint-profile-field-max-length@0.7.0
- @rethinkhealth/hl7v2-lint-profile-field-repetition@0.7.0
- @rethinkhealth/hl7v2-lint-profile-required-components@0.7.0
- @rethinkhealth/hl7v2-lint-profile-required-fields@0.7.0
- @rethinkhealth/hl7v2-lint-profile-table-values@0.7.0

## 0.6.0

### Minor Changes

- bd43116: Add preset that bundles all profile-based lint rules: required-fields, field-max-length, field-repetition, required-components, and table-values.

### Patch Changes

- Updated dependencies [1b6bf9b]
- Updated dependencies [7c9ba88]
- Updated dependencies [c593c84]
- Updated dependencies [86fd84f]
- Updated dependencies [228b78f]
- Updated dependencies [0d57a57]
- Updated dependencies [5221a37]
- Updated dependencies [9ad16c0]
- Updated dependencies [1f73b98]
  - @rethinkhealth/hl7v2-lint-profile-field-max-length@0.6.0
  - @rethinkhealth/hl7v2-lint-profile-required-fields@0.6.0
  - @rethinkhealth/hl7v2-lint-profile-field-repetition@0.6.0
  - @rethinkhealth/hl7v2-lint-profile-required-components@0.6.0
  - @rethinkhealth/hl7v2-lint-profile-table-values@0.6.0
  - @rethinkhealth/hl7v2-lint-profile-events-segments-order@0.6.0

# @rethinkhealth/hl7v2-profiles

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.23.0

## 0.22.0

### Minor Changes

- [#886](https://github.com/rethinkhealth/glion/pull/886) [`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7) Thanks [@meleksomai](https://github.com/meleksomai)! - A segment group carries an `id` and a `name`. The `id`, such as `PATIENT_VISIT`, holds only uppercase letters, digits, and `_`, and is what a path names the group by. The `name` is the group name for display, in title case with abbreviations spelled out, such as `Patient Visit` or `Master File Test Battery Detail`.

  The bundled event schemas replace the group IDs the HL7 XML schemas invent for groups some versions leave unnamed, such as `PIDNTE_SUPPGRP` in v2.5.1 `ORF_R04`, with the ID the nearest version gives the same segments (`PATIENT`), and spell `TIIMING`, `RSPONSE`, and `DEFINTION` as `TIMING`, `RESPONSE`, and `DEFINITION`. Paths that named those IDs change with them.

  **Breaking:** the event schema JSON Schema's `$id`, which every bundled schema names in `$schema`, is `https://glion.dev/schemas/event-schema/v2.json`. A `group` element of an event schema requires `id` as well as `name`, and the JSON Schema requires the `[A-Z][A-Z0-9_]*` pattern of the `id`, not the `name`. `runner` throws for a group with no ID. `GroupMatch` and the AST `Group` carry `id` and `name`, and `@glion/transform-profile-groups` sets both. `@glion/util-query` matches a group in a path by its `id`, and `format` writes the `id`. `@glion/jsonify` writes a group's `id` in `group` and adds its `name`. `@glion/builder`'s `g()` takes a string, used as both the ID and the name, or `{ id, name }`.

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.22.0

## 0.21.0

### Minor Changes

- [#860](https://github.com/rethinkhealth/glion/pull/860) [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74) Thanks [@meleksomai](https://github.com/meleksomai)! - Event schemas are the bundled data, and one engine validates segment order and groups segments.

  Each bundled event schema is a JSON file holding the schema as the standard defines it: segments, groups, and choices, each `optional` and `repeating`. `profiles.events.load()` returns that `EventSchema`. `runner(schema, segmentIds)` runs a message's segment IDs through its schema in one pass: it returns `matched` with the segment indexes nested in the groups the schema defines, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete` with the segment IDs that can come next.

  `@glion/profiles/event-schema.schema.json` is the JSON Schema of an event schema; every bundled schema names it in `$schema` by its `$id`, `https://glion.dev/schemas/event-schema/v1.json`. A schema of your own is plain data of the same shape and works wherever a bundled one does. `runner()` throws for a schema with no elements, a segment or group with no name, a group with no elements, a choice with no alternatives, or a choice alternative that can match no segment.

  A choice such as ORM*O01's `< OBR | RQD | RQ1 | RXO | ODS | ODT >` accepts exactly one alternative, where it used to demand all six in a row, so `lint-profile-segment-order` no longer reports valid lab and pharmacy orders ([#815](https://github.com/rethinkhealth/glion/issues/815)); 108 schemas change. A segment the schema names elsewhere may fill an `Hxx` position, as in QBP_Q11 ([#816](https://github.com/rethinkhealth/glion/issues/816)); 32 schemas change. Every `xsd:choice` is read as a choice; in 18 chapter 16 and 17 groups (`EHC*\*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`) this differs from HAPI, which reads them as sequences, so an `EHC_E01`invoice that carries more than one of`IVC`, `PYE`, `CTD`, … is reported as out of order until [#838](https://github.com/rethinkhealth/glion/issues/838) settles what the standard says. The rule's messages are otherwise unchanged.

  `lint-profile-segment-order` reports a segment with an empty ID as unexpected, like any segment the schema does not allow, where it reported "Segment has empty segment name".

  **Breaking:** the DFA is removed from the bundled profiles. `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the group `effects` API are removed; `runner(schema, segmentIds)` replaces the stateful runner: it takes a message's segment IDs at once and returns `matched`, `mismatched`, or `incomplete`, and `Runner`, `RunnerState`, `consume()`, `accepted`, `expected`, and the step and invalid events are removed. `lint-profile-segment-order`'s `definition` option takes an `EventSchema`, or a function `({ tree, file }) => EventSchema | undefined` (sync or async) that chooses one per message; the rule no longer exports `ResolveResult`. When the function returns `undefined`, the rule uses the schema MSH-9 names. The rule resolves the schema itself, so it no longer reads `file.data.profile` and no longer needs `@glion/annotate-profile-context` in the pipeline.

- [#858](https://github.com/rethinkhealth/glion/pull/858) [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9) Thanks [@meleksomai](https://github.com/meleksomai)! - The bundled fields, datatypes, tables, and UTG code systems are JSON, one file per profile, and the event maps and segments one JSON file per HL7v2 version. The build groups the profiles of each version and kind into chunks of about 100 kB of data, and a profile loads only its own chunk the first time it is requested. Importing the package loads 8.7 kB (brotli), down from 33.1 kB.

  Regenerating the data also brings two corrections: fields no longer reference the placeholder table `HL79999` ("no table for CE" in the HL7 database), and table 0211 and UTG code system `v2-0211` list `ASCII` where they listed `ascii`.

  `loadSegments(version)` gives each segment the name HL7 gives it in that version, in title case, where every version shared one title. Segments HL7 renamed change with it: `AIS` is "Appointment Information - Service" in 2.3 and 2.4 and "Appointment Information" from 2.5, and `ORG` is "Practitioner Organization Unit" from 2.4. `OM6` joins the segments of 2.5 and later, and `EQL`, `ERQ`, `ORO`, `QRD`, `QRF`, `RX1`, `SPR`, and `VTQ` have their names in place of their IDs.

  **Breaking:** `eventMaps`, the `@glion/profiles/event-maps` entry point, and `resolveMessageStructure` are removed. `profiles.eventMaps.load(version)` loads a version's event map the first time it is asked for. The map has no prototype, so a key read from a message, such as `__proto__`, has no entry, where `resolveMessageStructure` could return `Object.prototype`.

- [#858](https://github.com/rethinkhealth/glion/pull/858) [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** a store's `load`, `profiles.eventMaps.load`, and `loadSegments` resolve `undefined` for a version or profile the package does not bundle, where they rejected. They reject only when a bundled profile fails to load.

  `@glion/annotate-profile-context` and `@glion/lint-profile-segment-order` skip a profile the version does not bundle, as before, and no longer swallow a profile that fails to load: the plugin rejects with that error. `@glion/annotate-profile-fields-code-systems` tells an unbundled code system from a failed load by the `undefined` it resolves, not by the error's message.

- [#855](https://github.com/rethinkhealth/glion/pull/855) [`07d09ec`](https://github.com/rethinkhealth/glion/commit/07d09ec2c35cfce7dd145a2232ea079600dbd791) Thanks [@meleksomai](https://github.com/meleksomai)! - Each profile loads once per process: the module system imports its file once, and the store compiles it once, so later loads resolve the same value. A load that fails is not kept, so the next call imports again.

  **Breaking:** the LRU cache is removed with `lru-cache`. `createLruCache`, `Cache`, `CacheOptions`, `createProfiles` and its `ProfilesOptions`, the stores' `has`, `evict`, and `reset`, and `profiles.reset()` are removed; `profiles` holds the stores.

  **Breaking:** `createProfileStore`, `ProfileStoreConfig`, and `EventProfileStore` are removed; `profiles.events` is a `ProfileStore<Definition>`. `events.load` takes no options: an event always resolves to its message structure, and `EventLoadOptions` is removed.

- [#870](https://github.com/rethinkhealth/glion/pull/870) [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa) Thanks [@meleksomai](https://github.com/meleksomai)! - The runner compiles an event schema once, on its first run, and reuses the program for later runs of the same object, as RE2 and Rust's regex-automata do. A 14-segment ORU_R01 runs about 2.3 times as fast, and a 105-segment one about 1.8 times; a schema's first run costs more, once. A schema object must not change after its first run, and every schema `events.load` resolves is now frozen, at every depth: code that changed a loaded schema now throws.

  A segment named `anyZSegment`, as the HL7 v2 XML schemas name the slot for a site's Z-segment in the v2.2 to v2.4 master-file and query schemas, now matches any segment ID that starts with Z, as `Hxx` matches any segment ID. Those schemas used to reject their own Z-segment with `allowZSegments: false`, and every mismatch in them listed `anyZSegment` as expected ([#867](https://github.com/rethinkhealth/glion/issues/867)).

  A schema of any size runs: the runner no longer recurses, so a schema with thousands of optional elements in a row no longer overflows the call stack ([#827](https://github.com/rethinkhealth/glion/issues/827)).

- [#870](https://github.com/rethinkhealth/glion/pull/870) [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa) Thanks [@meleksomai](https://github.com/meleksomai)! - `runner(schema, segmentIds, options)` accepts a Z-segment, a segment ID that starts with `Z`, that the schema does not name at any position, as HL7v2 allows local Z-segments in any message and segment group (v2.5.1 §2.11). It groups such a segment right after the segment before it, in that segment's group. A Z-segment the schema names is matched like any other segment. Pass `{ allowZSegments: false }` to treat an unnamed Z-segment as a mismatch, as before ([#868](https://github.com/rethinkhealth/glion/issues/868)).

### Patch Changes

- [#858](https://github.com/rethinkhealth/glion/pull/858) [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9) Thanks [@meleksomai](https://github.com/meleksomai)! - Every version's event map gains `ACK: "ACK"`, and v2.5 and v2.5.1 gain `QRY: "QRY"`, so every bundled structure maps to itself. v2.4's event map no longer maps `QRY_P04` to a structure v2.4 does not define.

- [#878](https://github.com/rethinkhealth/glion/pull/878) [`8ac4236`](https://github.com/rethinkhealth/glion/commit/8ac42365f7c887db980f9da98bbde4f5286593bb) Thanks [@meleksomai](https://github.com/meleksomai)! - Twelve group names in nine v2.6 event schemas held a space or a `/`, such as `PATIENT VISIT` in `REF_I12` and `PRODUCT/SERVICE LINE_INFO` in `EHC_E10`. They are spelled with `_` now, as v2.5.1 and v2.7 spell them (`PATIENT_VISIT`, `PRODUCT_SERVICE_LINE_INFO`), so a `@glion/util-query` path can name them. The event schema JSON Schema requires a group name to match `^[A-Z][A-Z0-9_]*$` ([#866](https://github.com/rethinkhealth/glion/issues/866)).
- Updated dependencies []:
  - @glion/utils@0.21.0

## 0.20.0

### Patch Changes

- [#823](https://github.com/rethinkhealth/glion/pull/823) [`84ed35f`](https://github.com/rethinkhealth/glion/commit/84ed35fcaccc89dad7b658e7543ce6be792f731a) Thanks [@meleksomai](https://github.com/meleksomai)! - Importing `@glion/profiles` no longer loads profile data. Profiles are bundled into one chunk per HL7 version and kind (`events-v2.5.js`, `fields-v2.5.js`, …) plus one for UTG code systems, and a chunk loads the first time a profile in it is requested. Previously every chunk that shared a module with a manifest or event map loaded at import: 50 of 173 files, 9.2 MB. Importing the package now loads 2 files, 0.8 MB.
- Updated dependencies []:
  - @glion/utils@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
  - @glion/utils@0.18.0

## 0.17.0

### Patch Changes

- @glion/utils@0.17.0

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
  - @glion/utils@0.16.0

## 0.15.3

### Patch Changes

- @glion/utils@0.15.3

## 0.15.2

### Patch Changes

- @glion/utils@0.15.2

## 0.15.1

### Patch Changes

- @glion/utils@0.15.1

## 0.15.0

### Patch Changes

- 5d2e741: Fix DFA runner to match `Hxx` wildcard transitions for site-defined content.
  - Fix `runner()` to fall back to `Hxx` transition when no exact segment match exists
  - Fix effects lookup to use the `Hxx` key on wildcard matches, preventing silent loss of side effects
  - Rename `anyHL7Segment` to `Hxx` in all 99 generated profile automata (v2.3–v2.8.2), aligning with the HAPI convention

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [d07bc41]
- Updated dependencies [4af9499]
  - @glion/utils@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.14.1

## 0.14.0

### Minor Changes

- 3e2c278: Add segment title annotation plugin
  - New package `@rethinkhealth/hl7v2-annotate-profile-segments` — unified plugin that annotates Segment AST nodes with their HL7v2 specification title (e.g., MSH → "Message Header")
  - Add `profiles.segments` store to `@rethinkhealth/hl7v2-profiles` with per-version segment definitions
  - Extend `ProfileContext` with `segments: SegmentDefinition` (breaking — requires updating any code that constructs `ProfileContext` manually)
  - Wire plugin into `@rethinkhealth/hl7v2-preset-annotate-profile-recommended`

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.14.0

## 0.13.2

### Patch Changes

- 357e5e3: Remove incorrect `table: "HL70000"` references from field profiles across all HL7v2 versions
  - @rethinkhealth/hl7v2-utils@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-utils@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-utils@0.13.0

## 0.12.0

### Minor Changes

- 1ef2a1f: Add `resolveMessageStructure()` utility and remove `hl7v2-lint-message-structure-missing` rule.
  - Add `resolveMessageStructure(version, messageCode, triggerEvent)` to `@rethinkhealth/hl7v2-profiles` for resolving canonical message structure IDs from event maps
  - Resolve message structure from MSH-9.1 + MSH-9.2 via event maps when MSH-9.3 is absent in segment-order linting (wire value wins when present)
  - Remove `hl7v2-lint-message-structure-missing` from `hl7v2-preset-lint-recommended` — it produced false positives for pre-v2.3.1 messages where MSH-9.3 does not exist in the spec

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.11.0

## 0.10.1

### Patch Changes

- cacf65e: Fix field sequence numbers in v2.6–v2.8.2 profiles and re-insert deprecated fields

  The codegen pipeline that generated field profiles for HL7v2 versions v2.6 through v2.8.2 removed deprecated fields from the array and renumbered the remaining fields sequentially. This caused the `sequence` property to represent the array index rather than the HL7 field number, resulting in all annotation and validation applying the wrong metadata to fields in segments with deprecated fields.

  This fix:
  - Corrects `sequence` values on all existing fields to match the HL7 field number (extracted from the `id` property)
  - Re-inserts deprecated fields at their correct sequence positions with `deprecated: true`, sourced from the prior version that last included them
  - Ensures no sequence gaps exist in any segment definition

  127 files across 6 versions (v2.6, v2.7, v2.7.1, v2.8, v2.8.1, v2.8.2) were affected. Versions v2.1 through v2.5.1 were already correct and are unchanged.
  - @rethinkhealth/hl7v2-utils@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.10.0

## 0.9.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.7.0

## 0.6.0

### Patch Changes

- f00432e: Add identity mappings to event maps for all canonical message structures across all 13 HL7v2 versions (v2.1 through v2.8.2). Previously only alias mappings existed; now every valid event resolves to its canonical structure.
- 07fdace: Created a new profile package
- Updated dependencies [95e32f2]
  - @rethinkhealth/hl7v2-utils@0.6.0

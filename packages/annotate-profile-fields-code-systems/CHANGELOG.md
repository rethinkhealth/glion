# @rethinkhealth/hl7v2-annotate-profile-fields-code-systems

## 0.32.0

### Patch Changes

- Updated dependencies [[`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00)]:
  - @glion/ast@0.32.0
  - @glion/util-visit@0.32.0
  - @glion/profiles@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.31.0
  - @glion/profiles@0.31.0
  - @glion/util-visit@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.30.0
  - @glion/ast@0.30.0
  - @glion/profiles@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies []:
  - @glion/profiles@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.28.0
  - @glion/profiles@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0), [`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/profiles@0.27.1
  - @glion/util-visit@0.27.1
  - @glion/ast@0.27.1

## 0.27.0

### Patch Changes

- [#987](https://github.com/rethinkhealth/glion/pull/987) [`4a8da16`](https://github.com/rethinkhealth/glion/commit/4a8da1634fa33ed941699a6f9fbe88950af0983d) Thanks [@meleksomai](https://github.com/meleksomai)! - Lint findings describe the node they are placed on, never name it, and never contain content from the message (ADR 0030). ``Field `PID-5` (Patient Name) is 300 characters long; it allows at most 250.`` is now `The value is 300 characters long; the field allows at most 250.` The finding's `place` and `ancestors` locate the node, and `actual` carries the content. Findings about a field, component, or segment the message does not contain still name it from the profile or event schema. The `ruleId` of every finding is unchanged; only the text changes.

  - No value, part of a value, version, or Segment ID from the message appears in a finding's text: `lint-profile-withdrawn`, `lint-profile-backward-compatible`, `lint-profile-table-values`, `lint-profile-timestamps`, `lint-message-version`, `lint-required-message-header`, and `lint-segment-header-length` describe the content instead (`The day is past the end of its month; …`, `The Segment ID is 4 characters long; …`).
  - `lint-profile-segment-order` reports every out-of-place segment with one message, whatever its Segment ID or segment group.
  - `lint-no-trailing-empty-field` and `lint-required-message-header` report a segment with an empty Segment ID with the same message as any other.
  - `lint-profile-field-max-length`, `lint-profile-field-repetition`, `lint-profile-extra-components`, `lint-profile-withdrawn`, and `lint-profile-backward-compatible` check an element whose data has no `id`, such as one a site's own annotator sets.
  - `annotate-profile-fields-code-systems` reports a code system it cannot load in one sentence.

- Updated dependencies [[`7c24dbc`](https://github.com/rethinkhealth/glion/commit/7c24dbce0ae8ce90b04e69f5c4d6da290ba43650), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/profiles@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/ast@0.27.0

## 0.26.0

### Patch Changes

- [#950](https://github.com/rethinkhealth/glion/pull/950) [`0a425f0`](https://github.com/rethinkhealth/glion/commit/0a425f015f61ae5c4543e00218f9e0dedc29010d) Thanks [@meleksomai](https://github.com/meleksomai)! - `@glion/preset-annotate-profile-recommended` runs `@glion/annotate-profile-tables` in place of `@glion/annotate-profile-fields-code-systems`. A primitive value bound to a table now carries `data.tableValue`, read from the tables of the message's HL7v2 version, and fields no longer carry `data.codeSystem` nor repetitions `data.code`. Composite coded values, such as a CWE field, are not annotated by the preset.

  `@glion/annotate-profile-fields-code-systems` is experimental: its output may change in any release.

- Updated dependencies []:
  - @glion/ast@0.26.0
  - @glion/profiles@0.26.0
  - @glion/util-visit@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [[`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283)]:
  - @glion/profiles@0.25.0
  - @glion/ast@0.25.0
  - @glion/util-visit@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`e21c0a0`](https://github.com/rethinkhealth/glion/commit/e21c0a0e51db47f36e42926d9ec5a7a5f730b4d8)]:
  - @glion/profiles@0.24.0
  - @glion/util-visit@0.24.0
  - @glion/ast@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`a8aec03`](https://github.com/rethinkhealth/glion/commit/a8aec03333d5b24570145043ff4d2c99a5dde28b)]:
  - @glion/util-visit@0.23.0
  - @glion/ast@0.23.0
  - @glion/profiles@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/profiles@0.22.0
  - @glion/util-visit@0.22.0

## 0.21.0

### Patch Changes

- [#858](https://github.com/rethinkhealth/glion/pull/858) [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** a store's `load`, `profiles.eventMaps.load`, and `loadSegments` resolve `undefined` for a version or profile the package does not bundle, where they rejected. They reject only when a bundled profile fails to load.

  `@glion/annotate-profile-context` and `@glion/lint-profile-segment-order` skip a profile the version does not bundle, as before, and no longer swallow a profile that fails to load: the plugin rejects with that error. `@glion/annotate-profile-fields-code-systems` tells an unbundled code system from a failed load by the `undefined` it resolves, not by the error's message.

- Updated dependencies [[`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`07d09ec`](https://github.com/rethinkhealth/glion/commit/07d09ec2c35cfce7dd145a2232ea079600dbd791), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`8ac4236`](https://github.com/rethinkhealth/glion/commit/8ac42365f7c887db980f9da98bbde4f5286593bb), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa)]:
  - @glion/profiles@0.21.0
  - @glion/ast@0.21.0
  - @glion/util-visit@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`84ed35f`](https://github.com/rethinkhealth/glion/commit/84ed35fcaccc89dad7b658e7543ce6be792f731a)]:
  - @glion/profiles@0.20.0
  - @glion/util-visit@0.20.0
  - @glion/ast@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.19.0
  - @glion/profiles@0.19.0
  - @glion/util-visit@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
  - @glion/ast@0.18.0
  - @glion/profiles@0.18.0
  - @glion/util-visit@0.18.0

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0
- @glion/profiles@0.17.0
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
  - @glion/util-visit@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/profiles@0.15.3
- @glion/util-visit@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/profiles@0.15.2
- @glion/util-visit@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/profiles@0.15.1
- @glion/util-visit@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [5d2e741]
- Updated dependencies [4af9499]
  - @glion/profiles@0.15.0
  - @glion/ast@0.15.0
  - @glion/util-visit@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-visit@0.14.1
  - @rethinkhealth/hl7v2-profiles@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [3e2c278]
  - @rethinkhealth/hl7v2-profiles@0.14.0
  - @rethinkhealth/hl7v2-ast@0.14.0
  - @rethinkhealth/hl7v2-util-visit@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [357e5e3]
  - @rethinkhealth/hl7v2-profiles@0.13.2
  - @rethinkhealth/hl7v2-ast@0.13.2
  - @rethinkhealth/hl7v2-util-visit@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-profiles@0.13.1
  - @rethinkhealth/hl7v2-util-visit@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-profiles@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [1ef2a1f]
  - @rethinkhealth/hl7v2-profiles@0.12.0
  - @rethinkhealth/hl7v2-ast@0.12.0
  - @rethinkhealth/hl7v2-util-visit@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-profiles@0.11.0
- @rethinkhealth/hl7v2-util-visit@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies [cacf65e]
  - @rethinkhealth/hl7v2-profiles@0.10.1
  - @rethinkhealth/hl7v2-ast@0.10.1
  - @rethinkhealth/hl7v2-util-visit@0.10.1

## 0.10.0

### Minor Changes

- 32b61e8: Add field-level code systems annotation plugin that enriches coded value subcomponents with UTG display name, status, and code system identity. Scoped to field-level table references only — component-level tables tracked in #494. Also updates the preset to bundle all three annotators (fields + datatypes + fields-code-systems).

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-profiles@0.10.0
- @rethinkhealth/hl7v2-util-visit@0.10.0

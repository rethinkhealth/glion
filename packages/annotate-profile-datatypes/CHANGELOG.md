# @rethinkhealth/hl7v2-annotate-profile-datatypes

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-fields@0.30.0
  - @glion/util-visit@0.30.0
  - @glion/ast@0.30.0
  - @glion/utils@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56)]:
  - @glion/utils@0.29.0
  - @glion/annotate-profile-fields@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [[`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad)]:
  - @glion/utils@0.28.0
  - @glion/annotate-profile-fields@0.28.0
  - @glion/util-visit@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/util-visit@0.27.1
  - @glion/annotate-profile-fields@0.27.1
  - @glion/ast@0.27.1
  - @glion/utils@0.27.1

## 0.27.0

### Patch Changes

- [#988](https://github.com/rethinkhealth/glion/pull/988) [`cb4c228`](https://github.com/rethinkhealth/glion/commit/cb4c2284ffe7925108a3ea7b9f5bd1b3ec39641e) Thanks [@meleksomai](https://github.com/meleksomai)! - The annotators annotate each field, component, and subcomponent the profile defines by its sequence number, read from its place in the segment, field repetition, or component. They no longer read `info.sequence` from `@glion/util-visit`. The annotations are unchanged.
- Updated dependencies [[`cb4c228`](https://github.com/rethinkhealth/glion/commit/cb4c2284ffe7925108a3ea7b9f5bd1b3ec39641e), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/annotate-profile-fields@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/ast@0.27.0
  - @glion/utils@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-fields@0.26.0
  - @glion/ast@0.26.0
  - @glion/util-visit@0.26.0
  - @glion/utils@0.26.0

## 0.25.0

### Minor Changes

- [#940](https://github.com/rethinkhealth/glion/pull/940) [`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283) Thanks [@meleksomai](https://github.com/meleksomai)! - A field repetition gets the field's table as `data.table`, as components and subcomponents get theirs.

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-fields@0.25.0
  - @glion/ast@0.25.0
  - @glion/util-visit@0.25.0
  - @glion/utils@0.25.0

## 0.24.0

### Minor Changes

- [#917](https://github.com/rethinkhealth/glion/pull/917) [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68) Thanks [@meleksomai](https://github.com/meleksomai)! - A datatype component mirrors its row in the HL7v2 component table. `optionality` is the OPT column and `table` the TBL# column, both from chapter 2A of the standard for v2.5 through v2.8.2, and absent before v2.5, whose standard prints no component tables. A withdrawn component stays at its sequence with `optionality: "W"` and no datatype, as v2.7 XPN-6 (Degree). `requiredSequences` lists the components whose optionality is `"R"`. `@glion/annotate-profile-datatypes` copies the component profile onto `component.data` and `subcomponent.data` as the profile gives it, `sequence` included, so they have `optionality` and `table` in place of `required`.

  Fields and components share `Optionality` from `@glion/utils`, which includes `"RE"` (`Optionality.RequiredButMayBeEmpty`), printed by v2.7 and later for XPN-1 (Family Name).

  **Breaking:** `ComponentProfile.required` is removed, and so is `required` on `component.data` and `subcomponent.data`; read `optionality === "R"`. `ComponentProfile.datatypeId` is optional.

  **Breaking:** `required-components` now checks the components v2.5 and v2.5.1 print as required, which the profiles did not mark before. A v2.5 message whose MSH-9 is `ADT^A01`, without the message structure `ADT_A01`, now gets ``Component `MSH-9.3` (Message Structure) is not present; it is required.``, an error in `@glion/preset-lint-profile-recommended` and so in `parseHL7v2` from `@glion/hl7v2`. Send the message structure, or turn the rule off after the preset with `.use(hl7v2LintRequiredComponents, false)`.

  With components carrying `optionality`, `@glion/lint-profile-withdrawn` and `@glion/lint-profile-backward-compatible` report components as well as fields, with no change to the rules: a valued v2.7 XPN.6 (Degree) is an error, and a valued v2.5.1 XTN.1 (Telephone Number) is a warning, once per repetition.

### Patch Changes

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68)]:
  - @glion/annotate-profile-fields@0.24.0
  - @glion/utils@0.24.0
  - @glion/util-visit@0.24.0
  - @glion/ast@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`a8aec03`](https://github.com/rethinkhealth/glion/commit/a8aec03333d5b24570145043ff4d2c99a5dde28b)]:
  - @glion/util-visit@0.23.0
  - @glion/ast@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/util-visit@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.21.0
  - @glion/util-visit@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.20.0
  - @glion/ast@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.19.0
  - @glion/util-visit@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
  - @glion/ast@0.18.0
  - @glion/util-visit@0.18.0

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0
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
  - @glion/util-visit@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/util-visit@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/util-visit@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/util-visit@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/ast@0.15.0
  - @glion/util-visit@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-visit@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-util-visit@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-util-visit@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-util-visit@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- f411ebf: Centralize profile loading into a single context plugin

  New package:
  - `@rethinkhealth/hl7v2-annotate-profile-context` — unified plugin that loads all profile data (fields, datatypes, tables) once per pipeline run and attaches them to `file.data.profile` for downstream consumers

  Refactored packages (internal, no API changes):
  - 7 lint rules and 2 annotation plugins now read profiles from `file.data.profile` instead of loading them independently, eliminating duplicated async loading code from 9+ locations
  - Both profile presets include the context plugin as the first entry to ensure `file.data.profile` is populated before consumers run

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

## 0.12.0

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

### Minor Changes

- e15a046: Add profile-based datatype annotation plugin with stop-at-primitive cascade. Annotation flows down the AST (FieldRepetition → Component → Subcomponent) and stops where the primitive value lives. Also adds preset bundling fields + datatypes annotators.

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-profiles@0.9.0
  - @rethinkhealth/hl7v2-util-visit@0.9.0

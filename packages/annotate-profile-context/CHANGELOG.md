# @rethinkhealth/hl7v2-annotate-profile-context

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-query@0.30.0
  - @glion/util-visit@0.30.0
  - @glion/ast@0.30.0
  - @glion/profiles@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies []:
  - @glion/profiles@0.29.0
  - @glion/util-query@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-query@0.28.0
  - @glion/util-visit@0.28.0
  - @glion/profiles@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0), [`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/profiles@0.27.1
  - @glion/util-visit@0.27.1
  - @glion/ast@0.27.1
  - @glion/util-query@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [[`7c24dbc`](https://github.com/rethinkhealth/glion/commit/7c24dbce0ae8ce90b04e69f5c4d6da290ba43650), [`d702f6a`](https://github.com/rethinkhealth/glion/commit/d702f6a31ff95af55b3850e18d1d3f13f3accce7), [`799a57c`](https://github.com/rethinkhealth/glion/commit/799a57c8dd6bab65c3c655cef2515be4c0eb45d0), [`3dfa36e`](https://github.com/rethinkhealth/glion/commit/3dfa36e5ba03ad7bfe4ce037cc1bd12c53d42a1d), [`ac05055`](https://github.com/rethinkhealth/glion/commit/ac05055ab3348054d3c98429e53e7c105a82c02f), [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728), [`34d8e21`](https://github.com/rethinkhealth/glion/commit/34d8e217a9655cee2fdf42202ed58168c3ed72ed), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/profiles@0.27.0
  - @glion/util-query@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/ast@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.26.0
  - @glion/profiles@0.26.0
  - @glion/util-query@0.26.0
  - @glion/util-visit@0.26.0

## 0.25.0

### Minor Changes

- [#940](https://github.com/rethinkhealth/glion/pull/940) [`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283) Thanks [@meleksomai](https://github.com/meleksomai)! - `file.data.profile.tables` is keyed by TBL# as profiles print it (`"HL70001"`), not by the bare table number (`"0001"`), so `node.data.table` and `field.data.table` look up a table directly. It also holds the tables of the components of the fields' datatypes, such as `"HL70301"` for HD.3, not only the tables printed on fields.

### Patch Changes

- Updated dependencies [[`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283)]:
  - @glion/profiles@0.25.0
  - @glion/ast@0.25.0
  - @glion/util-query@0.25.0
  - @glion/util-visit@0.25.0

## 0.24.0

### Patch Changes

- [#917](https://github.com/rethinkhealth/glion/pull/917) [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68) Thanks [@meleksomai](https://github.com/meleksomai)! - A datatype component mirrors its row in the HL7v2 component table. `optionality` is the OPT column and `table` the TBL# column, both from chapter 2A of the standard for v2.5 through v2.8.2, and absent before v2.5, whose standard prints no component tables. A withdrawn component stays at its sequence with `optionality: "W"` and no datatype, as v2.7 XPN-6 (Degree). `requiredSequences` lists the components whose optionality is `"R"`. `@glion/annotate-profile-datatypes` copies the component profile onto `component.data` and `subcomponent.data` as the profile gives it, `sequence` included, so they have `optionality` and `table` in place of `required`.

  Fields and components share `Optionality` from `@glion/utils`, which includes `"RE"` (`Optionality.RequiredButMayBeEmpty`), printed by v2.7 and later for XPN-1 (Family Name).

  **Breaking:** `ComponentProfile.required` is removed, and so is `required` on `component.data` and `subcomponent.data`; read `optionality === "R"`. `ComponentProfile.datatypeId` is optional.

  **Breaking:** `required-components` now checks the components v2.5 and v2.5.1 print as required, which the profiles did not mark before. A v2.5 message whose MSH-9 is `ADT^A01`, without the message structure `ADT_A01`, now gets ``Component `MSH-9.3` (Message Structure) is not present; it is required.``, an error in `@glion/preset-lint-profile-recommended` and so in `parseHL7v2` from `@glion/hl7v2`. Send the message structure, or turn the rule off after the preset with `.use(hl7v2LintRequiredComponents, false)`.

  With components carrying `optionality`, `@glion/lint-profile-withdrawn` and `@glion/lint-profile-backward-compatible` report components as well as fields, with no change to the rules: a valued v2.7 XPN.6 (Degree) is an error, and a valued v2.5.1 XTN.1 (Telephone Number) is a warning, once per repetition.

- [#917](https://github.com/rethinkhealth/glion/pull/917) [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68) Thanks [@meleksomai](https://github.com/meleksomai)! - Give every v2.6 through v2.8.2 field profile its HL7v2 sequence. Fields after a withdrawn one had the sequence of their place in the list, so `bySequence` returned the wrong field and the profile rules checked a valid message against another field's datatype, table, and optionality ([#916](https://github.com/rethinkhealth/glion/issues/916)).

  Every field the standard lists is present at its sequence, including the withdrawn fields the XML schemas leave out, such as DG1-2 from v2.6 and the UB1 segment from v2.7. v2.5.1 OBX-23 to OBX-25 hold the profiles that sat at OBX-20 to OBX-22, and v2.8.1 RF1-18 (Remaining Benefit Amount), which the v2.8.1 sources omit, is present as v2.8 and v2.8.2 list it.

  **Breaking:** `FieldProfile.datatype` is optional. A withdrawn field the standard gives no datatype has none, and the component rules skip such fields. Code that reads `field.datatype` must handle `undefined`.

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`e21c0a0`](https://github.com/rethinkhealth/glion/commit/e21c0a0e51db47f36e42926d9ec5a7a5f730b4d8)]:
  - @glion/profiles@0.24.0
  - @glion/util-query@0.24.0
  - @glion/util-visit@0.24.0
  - @glion/ast@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`a8aec03`](https://github.com/rethinkhealth/glion/commit/a8aec03333d5b24570145043ff4d2c99a5dde28b)]:
  - @glion/util-visit@0.23.0
  - @glion/ast@0.23.0
  - @glion/profiles@0.23.0
  - @glion/util-query@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/profiles@0.22.0
  - @glion/util-query@0.22.0
  - @glion/util-visit@0.22.0

## 0.21.0

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

### Minor Changes

- 3e2c278: Add segment title annotation plugin
  - New package `@rethinkhealth/hl7v2-annotate-profile-segments` — unified plugin that annotates Segment AST nodes with their HL7v2 specification title (e.g., MSH → "Message Header")
  - Add `profiles.segments` store to `@rethinkhealth/hl7v2-profiles` with per-version segment definitions
  - Extend `ProfileContext` with `segments: SegmentDefinition` (breaking — requires updating any code that constructs `ProfileContext` manually)
  - Wire plugin into `@rethinkhealth/hl7v2-preset-annotate-profile-recommended`

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

### Minor Changes

- f411ebf: Centralize profile loading into a single context plugin

  New package:
  - `@rethinkhealth/hl7v2-annotate-profile-context` — unified plugin that loads all profile data (fields, datatypes, tables) once per pipeline run and attaches them to `file.data.profile` for downstream consumers

  Refactored packages (internal, no API changes):
  - 7 lint rules and 2 annotation plugins now read profiles from `file.data.profile` instead of loading them independently, eliminating duplicated async loading code from 9+ locations
  - Both profile presets include the context plugin as the first entry to ensure `file.data.profile` is populated before consumers run

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-profiles@0.13.0
  - @rethinkhealth/hl7v2-util-query@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

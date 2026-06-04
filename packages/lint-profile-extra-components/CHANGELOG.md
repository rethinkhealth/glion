# @rethinkhealth/hl7v2-lint-profile-extra-components

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0
- @glion/util-visit@0.17.0
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
- Updated dependencies [b7bdd6a]
  - @glion/ast@0.16.0
  - @glion/util-visit@0.16.0
  - @glion/utils@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/util-visit@0.15.3
- @glion/utils@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/util-visit@0.15.2
- @glion/utils@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/util-visit@0.15.1
- @glion/utils@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [d07bc41]
- Updated dependencies [4af9499]
  - @glion/utils@0.15.0
  - @glion/ast@0.15.0
  - @glion/util-visit@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-visit@0.14.1
  - @rethinkhealth/hl7v2-utils@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-util-visit@0.14.0
- @rethinkhealth/hl7v2-utils@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-util-visit@0.13.2
- @rethinkhealth/hl7v2-utils@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-utils@0.13.1
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
  - @rethinkhealth/hl7v2-utils@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

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

- Updated dependencies [1ef2a1f]
  - @rethinkhealth/hl7v2-profiles@0.12.0
  - @rethinkhealth/hl7v2-ast@0.12.0
  - @rethinkhealth/hl7v2-util-query@0.12.0
  - @rethinkhealth/hl7v2-util-visit@0.12.0
  - @rethinkhealth/hl7v2-utils@0.12.0

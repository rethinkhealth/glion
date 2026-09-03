# @rethinkhealth/hl7v2-lint-message-version

## 0.18.0

### Patch Changes

- @glion/util-query@0.18.0
- @glion/util-semver@0.18.0

## 0.17.0

### Patch Changes

- @glion/util-query@0.17.0
- @glion/util-semver@0.17.0

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
  - @glion/util-query@0.16.0
  - @glion/util-semver@0.16.0

## 0.15.3

### Patch Changes

- @glion/util-query@0.15.3
- @glion/util-semver@0.15.3

## 0.15.2

### Patch Changes

- @glion/util-query@0.15.2
- @glion/util-semver@0.15.2

## 0.15.1

### Patch Changes

- @glion/util-query@0.15.1
- @glion/util-semver@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/util-query@0.15.0
  - @glion/util-semver@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.14.1
- @rethinkhealth/hl7v2-util-semver@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.14.0
- @rethinkhealth/hl7v2-util-semver@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.13.2
- @rethinkhealth/hl7v2-util-semver@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-util-query@0.13.1
  - @rethinkhealth/hl7v2-util-semver@0.13.1

## 0.13.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.13.0
- @rethinkhealth/hl7v2-util-semver@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.12.0
- @rethinkhealth/hl7v2-util-semver@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.11.0
- @rethinkhealth/hl7v2-util-semver@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.10.1
- @rethinkhealth/hl7v2-util-semver@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.10.0
- @rethinkhealth/hl7v2-util-semver@0.10.0

## 0.9.0

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-util-semver@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [64da535]
  - @rethinkhealth/hl7v2-util-query@0.8.0
  - @rethinkhealth/hl7v2-util-semver@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.7.1
- @rethinkhealth/hl7v2-util-semver@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.7.0
- @rethinkhealth/hl7v2-util-semver@0.7.0

## 0.6.0

### Patch Changes

- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.
- Updated dependencies [7763c22]
- Updated dependencies [0b57ba9]
  - @rethinkhealth/hl7v2-util-query@0.6.0
  - @rethinkhealth/hl7v2-util-semver@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-util-query@0.5.0
  - @rethinkhealth/hl7v2-util-semver@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.4.2
- @rethinkhealth/hl7v2-util-semver@0.4.2

## 0.4.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.4.1
- @rethinkhealth/hl7v2-util-semver@0.4.1

## 0.4.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.4.0
- @rethinkhealth/hl7v2-util-semver@0.4.0

## 0.3.4

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.3.4
- @rethinkhealth/hl7v2-util-semver@0.3.4

## 0.3.3

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.3.3
- @rethinkhealth/hl7v2-util-semver@0.3.3

## 0.3.2

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.3.2
- @rethinkhealth/hl7v2-util-semver@0.3.2

## 0.3.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.3.1
- @rethinkhealth/hl7v2-util-semver@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e582209]
  - @rethinkhealth/hl7v2-util-semver@0.3.0
  - @rethinkhealth/hl7v2-util-query@0.3.0

## 0.2.31

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.31
- @rethinkhealth/hl7v2-util-semver@0.2.31

## 0.2.30

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.30
- @rethinkhealth/hl7v2-util-semver@0.2.30

## 0.2.29

### Patch Changes

- 6d2be85: Update the error messages to follow our linting guidelines.
  - @rethinkhealth/hl7v2-util-query@0.2.29
  - @rethinkhealth/hl7v2-util-semver@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies [db630bd]
  - @rethinkhealth/hl7v2-util-query@0.2.28
  - @rethinkhealth/hl7v2-util-semver@0.2.28

## 0.2.27

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.27
- @rethinkhealth/hl7v2-util-semver@0.2.27

## 0.2.26

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.26
- @rethinkhealth/hl7v2-util-semver@0.2.26

## 0.2.25

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.25
- @rethinkhealth/hl7v2-util-semver@0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern
- Updated dependencies [8385da0]
  - @rethinkhealth/hl7v2-util-semver@0.2.24
  - @rethinkhealth/hl7v2-util-query@0.2.24

## 0.2.23

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.2.23
- @rethinkhealth/hl7v2-util-semver@0.2.23

## 0.2.22

### Patch Changes

- 13185b6: Replace/refactor the existing `hl7v2-lint-max-message-version` package with `hl7v2-lint-message-version`, changing behavior from a configurable maximum to a fixed range for message version validation.
  - @rethinkhealth/hl7v2-util-query@0.2.22

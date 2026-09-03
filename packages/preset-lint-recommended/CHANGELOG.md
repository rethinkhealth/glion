# @rethinkhealth/hl7v2-preset-lint-recommended

## 0.18.0

### Patch Changes

- @glion/lint-message-version@0.18.0
- @glion/lint-no-trailing-empty-field@0.18.0
- @glion/lint-required-message-header@0.18.0
- @glion/lint-segment-header-length@0.18.0

## 0.17.0

### Patch Changes

- @glion/lint-message-version@0.17.0
- @glion/lint-no-trailing-empty-field@0.17.0
- @glion/lint-required-message-header@0.17.0
- @glion/lint-segment-header-length@0.17.0

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
  - @glion/lint-message-version@0.16.0
  - @glion/lint-no-trailing-empty-field@0.16.0
  - @glion/lint-required-message-header@0.16.0
  - @glion/lint-segment-header-length@0.16.0

## 0.15.3

### Patch Changes

- @glion/lint-message-version@0.15.3
- @glion/lint-no-trailing-empty-field@0.15.3
- @glion/lint-required-message-header@0.15.3
- @glion/lint-segment-header-length@0.15.3

## 0.15.2

### Patch Changes

- @glion/lint-message-version@0.15.2
- @glion/lint-no-trailing-empty-field@0.15.2
- @glion/lint-required-message-header@0.15.2
- @glion/lint-segment-header-length@0.15.2

## 0.15.1

### Patch Changes

- @glion/lint-message-version@0.15.1
- @glion/lint-no-trailing-empty-field@0.15.1
- @glion/lint-required-message-header@0.15.1
- @glion/lint-segment-header-length@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/lint-message-version@0.15.0
  - @glion/lint-no-trailing-empty-field@0.15.0
  - @glion/lint-required-message-header@0.15.0
  - @glion/lint-segment-header-length@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.14.1
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.14.1
- @rethinkhealth/hl7v2-lint-required-message-header@0.14.1
- @rethinkhealth/hl7v2-lint-segment-header-length@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.14.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.14.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.14.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.13.2
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.13.2
- @rethinkhealth/hl7v2-lint-required-message-header@0.13.2
- @rethinkhealth/hl7v2-lint-segment-header-length@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-lint-message-version@0.13.1
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.13.1
  - @rethinkhealth/hl7v2-lint-required-message-header@0.13.1
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.13.1

## 0.13.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.13.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.13.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.13.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.13.0

## 0.12.0

### Minor Changes

- 1ef2a1f: Add `resolveMessageStructure()` utility and remove `hl7v2-lint-message-structure-missing` rule.
  - Add `resolveMessageStructure(version, messageCode, triggerEvent)` to `@rethinkhealth/hl7v2-profiles` for resolving canonical message structure IDs from event maps
  - Resolve message structure from MSH-9.1 + MSH-9.2 via event maps when MSH-9.3 is absent in segment-order linting (wire value wins when present)
  - Remove `hl7v2-lint-message-structure-missing` from `hl7v2-preset-lint-recommended` — it produced false positives for pre-v2.3.1 messages where MSH-9.3 does not exist in the spec

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.12.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.12.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.12.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.11.0
- @rethinkhealth/hl7v2-lint-message-version@0.11.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.11.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.11.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.10.1
- @rethinkhealth/hl7v2-lint-message-version@0.10.1
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.10.1
- @rethinkhealth/hl7v2-lint-required-message-header@0.10.1
- @rethinkhealth/hl7v2-lint-segment-header-length@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.10.0
- @rethinkhealth/hl7v2-lint-message-version@0.10.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.10.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.10.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-lint-message-version@0.9.0
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.9.0
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.9.0
  - @rethinkhealth/hl7v2-lint-required-message-header@0.9.0
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.8.0
- @rethinkhealth/hl7v2-lint-message-version@0.8.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.8.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.8.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.7.1
- @rethinkhealth/hl7v2-lint-message-version@0.7.1
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.7.1
- @rethinkhealth/hl7v2-lint-required-message-header@0.7.1
- @rethinkhealth/hl7v2-lint-segment-header-length@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.7.0
- @rethinkhealth/hl7v2-lint-message-version@0.7.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.7.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.7.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [1f73b98]
  - @rethinkhealth/hl7v2-lint-message-version@0.6.0
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.6.0
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.6.0
  - @rethinkhealth/hl7v2-lint-required-message-header@0.6.0
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.5.0
  - @rethinkhealth/hl7v2-lint-required-message-header@0.5.0
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.5.0
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.5.0
  - @rethinkhealth/hl7v2-lint-message-version@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.4.2
- @rethinkhealth/hl7v2-lint-message-version@0.4.2
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.4.2
- @rethinkhealth/hl7v2-lint-required-message-header@0.4.2
- @rethinkhealth/hl7v2-lint-segment-header-length@0.4.2

## 0.4.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.4.1
- @rethinkhealth/hl7v2-lint-message-version@0.4.1
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.4.1
- @rethinkhealth/hl7v2-lint-required-message-header@0.4.1
- @rethinkhealth/hl7v2-lint-segment-header-length@0.4.1

## 0.4.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.4.0
- @rethinkhealth/hl7v2-lint-message-version@0.4.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.4.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.4.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.4.0

## 0.3.4

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.3.4
- @rethinkhealth/hl7v2-lint-message-version@0.3.4
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.3.4
- @rethinkhealth/hl7v2-lint-required-message-header@0.3.4
- @rethinkhealth/hl7v2-lint-segment-header-length@0.3.4

## 0.3.3

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.3.3
- @rethinkhealth/hl7v2-lint-message-version@0.3.3
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.3.3
- @rethinkhealth/hl7v2-lint-required-message-header@0.3.3
- @rethinkhealth/hl7v2-lint-segment-header-length@0.3.3

## 0.3.2

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.3.2
- @rethinkhealth/hl7v2-lint-message-structure-missing@0.3.2
- @rethinkhealth/hl7v2-lint-message-version@0.3.2
- @rethinkhealth/hl7v2-lint-required-message-header@0.3.2
- @rethinkhealth/hl7v2-lint-segment-header-length@0.3.2

## 0.3.1

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.3.1
- @rethinkhealth/hl7v2-lint-message-structure-missing@0.3.1
- @rethinkhealth/hl7v2-lint-message-version@0.3.1
- @rethinkhealth/hl7v2-lint-required-message-header@0.3.1
- @rethinkhealth/hl7v2-lint-segment-header-length@0.3.1

## 0.3.0

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.3.0
- @rethinkhealth/hl7v2-lint-message-structure-missing@0.3.0
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.3.0
- @rethinkhealth/hl7v2-lint-required-message-header@0.3.0
- @rethinkhealth/hl7v2-lint-segment-header-length@0.3.0

## 0.2.31

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.31
- @rethinkhealth/hl7v2-lint-message-version@0.2.31
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.31
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.31
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [22d95e8]
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.30
  - @rethinkhealth/hl7v2-lint-message-version@0.2.30
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.30
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.30
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.30

## 0.2.29

### Patch Changes

- 6d2be85: Update the error messages to follow our linting guidelines.
- Updated dependencies [6d2be85]
- Updated dependencies [6d2be85]
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.29
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.29
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.29
  - @rethinkhealth/hl7v2-lint-message-version@0.2.29
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies [13db397]
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.28
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.28
  - @rethinkhealth/hl7v2-lint-message-version@0.2.28
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.28
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.28

## 0.2.27

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.27
- @rethinkhealth/hl7v2-lint-message-version@0.2.27
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.27
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.27
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.27

## 0.2.26

### Patch Changes

- 8584465: Added a new lint rule package to check if MSH-9.3 (message structure) is not missing
- Updated dependencies [8584465]
  - @rethinkhealth/hl7v2-lint-message-structure-missing@0.2.26
  - @rethinkhealth/hl7v2-lint-message-version@0.2.26
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.26
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.26
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.26

## 0.2.25

### Patch Changes

- @rethinkhealth/hl7v2-lint-message-version@0.2.25
- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.25
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.25
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern
- Updated dependencies [8385da0]
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.24
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.24
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.24
  - @rethinkhealth/hl7v2-lint-message-version@0.2.24

## 0.2.23

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.23
- @rethinkhealth/hl7v2-lint-message-version@0.2.23
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.23
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.23

## 0.2.22

### Patch Changes

- 9523158: Introduce a lint rule that fails if the HL7v2 message version exceeds 2.9.9. This helps ensure compatibility with widely adopted HL7v2 tooling and standards, preventing accidental use of unsupported or nonstandard message versions.
- Updated dependencies [13185b6]
  - @rethinkhealth/hl7v2-lint-message-version@0.2.22
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.22
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.22
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.22

## 0.2.21

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.21
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.21
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies [e16e519]
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.20
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.20
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies [04954f1]
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.19
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.19
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.19

## 0.2.18

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.18
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.18
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.18

## 0.2.17

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.17
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.17
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.17

## 0.2.16

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.16
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.16
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.16

## 0.2.15

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.15
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.15
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.15

## 0.2.14

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.14
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.14
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.14

## 0.2.13

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.13
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.13
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.13

## 0.2.12

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.12
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.12
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.12

## 0.2.11

### Patch Changes

- @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.11
- @rethinkhealth/hl7v2-lint-required-message-header@0.2.11
- @rethinkhealth/hl7v2-lint-segment-header-length@0.2.11

## 0.2.10

### Patch Changes

- e279025: Added `@rethinkhealth/hl7v2-lint-no-trailing-empty-field` to the list of recommended linting rules to the recommended preset.
- Updated dependencies [e279025]
  - @rethinkhealth/hl7v2-lint-no-trailing-empty-field@0.2.10
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.10
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.10

## 0.2.9

### Patch Changes

- d7af0e6: Refactoring to improve package management and linting
- Updated dependencies [d7af0e6]
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.9
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.9

## 0.2.8

### Patch Changes

- 206948a: A package that bundles a preset of rules for easy adoption in HL7v2 processing pipelines.
- Updated dependencies [206948a]
- Updated dependencies [4f76bad]
  - @rethinkhealth/hl7v2-lint-segment-header-length@0.2.8
  - @rethinkhealth/hl7v2-lint-required-message-header@0.2.8

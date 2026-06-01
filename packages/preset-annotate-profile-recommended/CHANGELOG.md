# @rethinkhealth/hl7v2-preset-annotate-profile-recommended

## 0.17.0

### Patch Changes

- @glion/annotate-profile-context@0.17.0
- @glion/annotate-profile-datatypes@0.17.0
- @glion/annotate-profile-fields@0.17.0
- @glion/annotate-profile-fields-code-systems@0.17.0
- @glion/annotate-profile-segments@0.17.0

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
  - @glion/annotate-profile-datatypes@0.16.0
  - @glion/annotate-profile-fields@0.16.0
  - @glion/annotate-profile-fields-code-systems@0.16.0
  - @glion/annotate-profile-segments@0.16.0

## 0.15.3

### Patch Changes

- @glion/annotate-profile-context@0.15.3
- @glion/annotate-profile-datatypes@0.15.3
- @glion/annotate-profile-fields@0.15.3
- @glion/annotate-profile-fields-code-systems@0.15.3
- @glion/annotate-profile-segments@0.15.3

## 0.15.2

### Patch Changes

- @glion/annotate-profile-context@0.15.2
- @glion/annotate-profile-datatypes@0.15.2
- @glion/annotate-profile-fields@0.15.2
- @glion/annotate-profile-fields-code-systems@0.15.2
- @glion/annotate-profile-segments@0.15.2

## 0.15.1

### Patch Changes

- @glion/annotate-profile-context@0.15.1
- @glion/annotate-profile-datatypes@0.15.1
- @glion/annotate-profile-fields@0.15.1
- @glion/annotate-profile-fields-code-systems@0.15.1
- @glion/annotate-profile-segments@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/annotate-profile-context@0.15.0
  - @glion/annotate-profile-datatypes@0.15.0
  - @glion/annotate-profile-fields@0.15.0
  - @glion/annotate-profile-fields-code-systems@0.15.0
  - @glion/annotate-profile-segments@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-context@0.14.1
- @rethinkhealth/hl7v2-annotate-profile-datatypes@0.14.1
- @rethinkhealth/hl7v2-annotate-profile-fields@0.14.1
- @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.14.1
- @rethinkhealth/hl7v2-annotate-profile-segments@0.14.1

## 0.14.0

### Minor Changes

- 3e2c278: Add segment title annotation plugin
  - New package `@rethinkhealth/hl7v2-annotate-profile-segments` — unified plugin that annotates Segment AST nodes with their HL7v2 specification title (e.g., MSH → "Message Header")
  - Add `profiles.segments` store to `@rethinkhealth/hl7v2-profiles` with per-version segment definitions
  - Extend `ProfileContext` with `segments: SegmentDefinition` (breaking — requires updating any code that constructs `ProfileContext` manually)
  - Wire plugin into `@rethinkhealth/hl7v2-preset-annotate-profile-recommended`

### Patch Changes

- Updated dependencies [3e2c278]
  - @rethinkhealth/hl7v2-annotate-profile-context@0.14.0
  - @rethinkhealth/hl7v2-annotate-profile-segments@0.14.0
  - @rethinkhealth/hl7v2-annotate-profile-fields@0.14.0
  - @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.14.0
  - @rethinkhealth/hl7v2-annotate-profile-datatypes@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-context@0.13.2
- @rethinkhealth/hl7v2-annotate-profile-fields@0.13.2
- @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.13.2
- @rethinkhealth/hl7v2-annotate-profile-datatypes@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-annotate-profile-context@0.13.1
  - @rethinkhealth/hl7v2-annotate-profile-fields@0.13.1
  - @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.13.1
  - @rethinkhealth/hl7v2-annotate-profile-datatypes@0.13.1

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
  - @rethinkhealth/hl7v2-annotate-profile-fields@0.13.0
  - @rethinkhealth/hl7v2-annotate-profile-datatypes@0.13.0
  - @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-datatypes@0.12.0
- @rethinkhealth/hl7v2-annotate-profile-fields@0.12.0
- @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-datatypes@0.11.0
- @rethinkhealth/hl7v2-annotate-profile-fields@0.11.0
- @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-annotate-profile-datatypes@0.10.1
- @rethinkhealth/hl7v2-annotate-profile-fields@0.10.1
- @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.10.1

## 0.10.0

### Minor Changes

- 32b61e8: Add field-level code systems annotation plugin that enriches coded value subcomponents with UTG display name, status, and code system identity. Scoped to field-level table references only — component-level tables tracked in #494. Also updates the preset to bundle all three annotators (fields + datatypes + fields-code-systems).

### Patch Changes

- Updated dependencies [32b61e8]
  - @rethinkhealth/hl7v2-annotate-profile-fields-code-systems@0.10.0
  - @rethinkhealth/hl7v2-annotate-profile-datatypes@0.10.0
  - @rethinkhealth/hl7v2-annotate-profile-fields@0.10.0

## 0.9.0

### Minor Changes

- e15a046: Add profile-based datatype annotation plugin with stop-at-primitive cascade. Annotation flows down the AST (FieldRepetition → Component → Subcomponent) and stops where the primitive value lives. Also adds preset bundling fields + datatypes annotators.

### Patch Changes

- Updated dependencies [e15a046]
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-annotate-profile-datatypes@0.9.0
  - @rethinkhealth/hl7v2-annotate-profile-fields@0.9.0

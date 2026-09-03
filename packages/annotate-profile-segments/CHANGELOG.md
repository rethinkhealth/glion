# @rethinkhealth/hl7v2-annotate-profile-segments

## 0.18.0

### Patch Changes

- @glion/util-visit@0.18.0
- @glion/ast@0.18.0

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

### Minor Changes

- 3e2c278: Add segment title annotation plugin
  - New package `@rethinkhealth/hl7v2-annotate-profile-segments` — unified plugin that annotates Segment AST nodes with their HL7v2 specification title (e.g., MSH → "Message Header")
  - Add `profiles.segments` store to `@rethinkhealth/hl7v2-profiles` with per-version segment definitions
  - Extend `ProfileContext` with `segments: SegmentDefinition` (breaking — requires updating any code that constructs `ProfileContext` manually)
  - Wire plugin into `@rethinkhealth/hl7v2-preset-annotate-profile-recommended`

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-util-visit@0.14.0

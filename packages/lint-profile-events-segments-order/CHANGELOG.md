# @rethinkhealth/hl7v2-lint-profile-events-segments-order

## 0.18.0

### Patch Changes

- @glion/util-query@0.18.0
- @glion/util-visit@0.18.0
- @glion/ast@0.18.0
- @glion/profiles@0.18.0

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

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-profiles@0.13.0
  - @rethinkhealth/hl7v2-util-query@0.13.0
  - @rethinkhealth/hl7v2-util-visit@0.13.0

## 0.12.0

### Minor Changes

- 1ef2a1f: Add `resolveMessageStructure()` utility and remove `hl7v2-lint-message-structure-missing` rule.
  - Add `resolveMessageStructure(version, messageCode, triggerEvent)` to `@rethinkhealth/hl7v2-profiles` for resolving canonical message structure IDs from event maps
  - Resolve message structure from MSH-9.1 + MSH-9.2 via event maps when MSH-9.3 is absent in segment-order linting (wire value wins when present)
  - Remove `hl7v2-lint-message-structure-missing` from `hl7v2-preset-lint-recommended` — it produced false positives for pre-v2.3.1 messages where MSH-9.3 does not exist in the spec

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

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-profiles@0.9.0
  - @rethinkhealth/hl7v2-util-visit@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [64da535]
  - @rethinkhealth/hl7v2-util-query@0.8.0
  - @rethinkhealth/hl7v2-ast@0.8.0
  - @rethinkhealth/hl7v2-profiles@0.8.0
  - @rethinkhealth/hl7v2-util-visit@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.1
- @rethinkhealth/hl7v2-profiles@0.7.1
- @rethinkhealth/hl7v2-util-query@0.7.1
- @rethinkhealth/hl7v2-util-visit@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.0
- @rethinkhealth/hl7v2-profiles@0.7.0
- @rethinkhealth/hl7v2-util-query@0.7.0
- @rethinkhealth/hl7v2-util-visit@0.7.0

## 0.6.0

### Patch Changes

- 9ad16c0: New lint rule that validates HL7v2 segment order against message structure profiles using the DFA automaton runner.
  - Resolves profile from `tree.data.messageInfo` or MSH-9.3/MSH-12 — no compensation logic
  - Uses `file.message()` for consumer-controlled severity
  - Stops at first invalid segment (DFA cannot recover)
  - Reports empty/undefined segment names as errors
  - Pure `resolveDefinition()` returns a Result type (no side effects)

- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.
- Updated dependencies [f00432e]
- Updated dependencies [07fdace]
- Updated dependencies [7763c22]
- Updated dependencies [0b57ba9]
  - @rethinkhealth/hl7v2-profiles@0.6.0
  - @rethinkhealth/hl7v2-util-query@0.6.0
  - @rethinkhealth/hl7v2-util-visit@0.6.0
  - @rethinkhealth/hl7v2-ast@0.6.0

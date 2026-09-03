# @rethinkhealth/hl7v2-annotate-delimiters

## 0.18.0

### Patch Changes

- @glion/util-query@0.18.0

## 0.17.0

### Patch Changes

- @glion/util-query@0.17.0

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

## 0.15.3

### Patch Changes

- @glion/util-query@0.15.3

## 0.15.2

### Patch Changes

- 97a5441: Add `files: ["dist"]` so the published tarball no longer ships `src/`, `tests/`, `tsup.config.ts`, `vitest.config.ts`, `tsconfig.tsbuildinfo`, or `.turbo/` logs. Caught by the new `publint` packaging check (ADR 0015).
  - @glion/util-query@0.15.2

## 0.15.1

### Patch Changes

- @glion/util-query@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/util-query@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-util-query@0.13.1

## 0.13.0

### Minor Changes

- 575978f: Remove `root.data.delimiters` and derive delimiters from MSH-1/MSH-2 via `file.data` per ADR 0014.
  - Add `resolveDelimiters()` utility in `hl7v2-utils` that extracts delimiters from MSH-1 (field separator) and MSH-2 (encoding characters), falling back to `DEFAULT_DELIMITERS`
  - Add `hl7v2-annotate-delimiters` plugin that sets `file.data.delimiters` from MSH for downstream plugins
  - Add VFile type augmentation (`DataMap.delimiters`) in `hl7v2-ast` for type-safe `file.data.delimiters` access
  - Remove `delimiters` from `RootData` interface — consumers should read `file.data.delimiters` or call `resolveDelimiters()`
  - Change `hl7v2-decode-escapes`, `hl7v2-encode-escapes`, and `hl7v2-to-hl7v2` to read `file.data.delimiters` with `resolveDelimiters()` fallback
  - Fix `hl7v2-encode-escapes` to skip MSH-1 and MSH-2 during encoding (they define delimiters and must not be escaped per the HL7v2 spec)
  - Rename `getDelimiters` to `resolveDelimiters` to clarify its role as a derivation function
  - Add `hl7v2-annotate-delimiters` to the default pipeline in `hl7v2`

### Patch Changes

- @rethinkhealth/hl7v2-util-query@0.13.0

# @rethinkhealth/hl7v2-decode-escapes

## 0.17.0

### Patch Changes

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
  - @glion/utils@0.16.0

## 0.15.3

### Patch Changes

- @glion/utils@0.15.3

## 0.15.2

### Patch Changes

- @glion/utils@0.15.2

## 0.15.1

### Patch Changes

- @glion/utils@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [d07bc41]
- Updated dependencies [4af9499]
  - @glion/utils@0.15.0

## 0.14.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-utils@0.13.1

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

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-utils@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.10.0

## 0.9.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.7.1

## 0.7.0

### Patch Changes

- 12dbe59: Fix delimiter precedence so that `options.delimiters` override `tree.data.delimiters`. Previously, explicit options were ignored when the tree already had delimiters set.
- 951dfca: Explicitly strip highlighting escape sequences (`\H\`, `\N\`) during decoding. These presentational markers are intentionally removed as they serve no purpose in parsed message values. Added tests for stripping behavior alongside other escape sequences.
  - @rethinkhealth/hl7v2-utils@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [95e32f2]
  - @rethinkhealth/hl7v2-utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-utils@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.4.2

## 0.4.1

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [0145c27]
  - @rethinkhealth/hl7v2-utils@0.4.0

## 0.3.4

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.3.4

## 0.3.3

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [0dda39c]
  - @rethinkhealth/hl7v2-utils@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [2f029e2]
  - @rethinkhealth/hl7v2-utils@0.3.1

## 0.3.0

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.3.0

## 0.2.31

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.31

## 0.2.30

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.30

## 0.2.29

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.29

## 0.2.28

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.28

## 0.2.27

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.27

## 0.2.26

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.26

## 0.2.25

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern
- Updated dependencies [8385da0]
  - @rethinkhealth/hl7v2-utils@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies [f2d00ea]
  - @rethinkhealth/hl7v2-utils@0.2.23

## 0.2.22

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.22

## 0.2.21

### Patch Changes

- Updated dependencies [41a4304]
  - @rethinkhealth/hl7v2-utils@0.2.21

## 0.2.20

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.20

## 0.2.19

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.19

## 0.2.18

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.18

## 0.2.17

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.17

## 0.2.16

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.16

## 0.2.15

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.15

## 0.2.14

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.14

## 0.2.13

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.13

## 0.2.12

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.12

## 0.2.11

### Patch Changes

- 2b86a32: Minor fix to the delimiters and carriage return for segments.
  - @rethinkhealth/hl7v2-utils@0.2.11

## 0.2.10

### Patch Changes

- Updated dependencies [e279025]
  - @rethinkhealth/hl7v2-utils@0.2.10

## 0.2.9

### Patch Changes

- d7af0e6: Refactoring to improve package management and linting
- Updated dependencies [d7af0e6]
  - @rethinkhealth/hl7v2-utils@0.2.9

## 0.2.8

### Patch Changes

- Updated dependencies [8d0a1ce]
  - @rethinkhealth/hl7v2-utils@0.2.8

## 0.2.7

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.7

## 0.2.6

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.6

## 0.2.5

### Patch Changes

- 6a4d5b8: Several improvements to the HL7v2 package, focusing on integrating the HL7v2 escape sequence decoder, enhancing test coverage with Vitest, and ensuring the parser uses default preprocessors.
  - @rethinkhealth/hl7v2-utils@0.2.5

## 0.2.4

### Patch Changes

- 28fef0d: Introduce `@rethinkhealth/hl7v2-decode-escapes`, a new package for decoding HL7v2 escape sequences. HL7v2 messages use escape sequences to represent reserved separator characters and special symbols within data fields. This package provides utilities to accurately decode these sequences, ensuring correct parsing and interpretation of HL7v2 message content.
- Updated dependencies [28fef0d]
  - @rethinkhealth/hl7v2-utils@0.2.4

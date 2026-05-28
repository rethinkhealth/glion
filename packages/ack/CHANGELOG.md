# @rethinkhealth/hl7v2-ack

## 0.16.0

### Minor Changes

- 5e3d97e: Add an optional `raw` attribute to `AckException` (and to `AckExceptionOptions`). Clients that derive an `AckException` from an incoming NAK populate this attribute with the wire-format ACK message, so callers can inspect, re-parse, log, or persist the original payload directly from the thrown error. The attribute is `undefined` for exceptions constructed by application code that has not yet received an ACK.
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
  - @glion/builder@0.16.0
  - @glion/util-query@0.16.0
  - @glion/util-timestamp@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/builder@0.15.3
- @glion/util-query@0.15.3
- @glion/util-timestamp@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/builder@0.15.2
- @glion/util-query@0.15.2
- @glion/util-timestamp@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/builder@0.15.1
- @glion/util-query@0.15.1
- @glion/util-timestamp@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/ast@0.15.0
  - @glion/builder@0.15.0
  - @glion/util-query@0.15.0
  - @glion/util-timestamp@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-query@0.14.1
  - @rethinkhealth/hl7v2-builder@0.14.1
  - @rethinkhealth/hl7v2-util-timestamp@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-builder@0.14.0
- @rethinkhealth/hl7v2-util-query@0.14.0
- @rethinkhealth/hl7v2-util-timestamp@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-builder@0.13.2
- @rethinkhealth/hl7v2-util-query@0.13.2
- @rethinkhealth/hl7v2-util-timestamp@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-builder@0.13.1
  - @rethinkhealth/hl7v2-util-query@0.13.1
  - @rethinkhealth/hl7v2-util-timestamp@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-builder@0.13.0
  - @rethinkhealth/hl7v2-util-query@0.13.0
  - @rethinkhealth/hl7v2-util-timestamp@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.12.0
- @rethinkhealth/hl7v2-builder@0.12.0
- @rethinkhealth/hl7v2-util-query@0.12.0
- @rethinkhealth/hl7v2-util-timestamp@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-builder@0.11.0
- @rethinkhealth/hl7v2-util-query@0.11.0
- @rethinkhealth/hl7v2-util-timestamp@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.1
- @rethinkhealth/hl7v2-builder@0.10.1
- @rethinkhealth/hl7v2-util-query@0.10.1
- @rethinkhealth/hl7v2-util-timestamp@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-builder@0.10.0
- @rethinkhealth/hl7v2-util-query@0.10.0
- @rethinkhealth/hl7v2-util-timestamp@0.10.0

## 0.9.0

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-builder@0.9.0
  - @rethinkhealth/hl7v2-util-timestamp@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [64da535]
  - @rethinkhealth/hl7v2-util-query@0.8.0
  - @rethinkhealth/hl7v2-ast@0.8.0
  - @rethinkhealth/hl7v2-builder@0.8.0
  - @rethinkhealth/hl7v2-util-timestamp@0.8.0

## 0.7.1

### Patch Changes

- fcf9e3a: Add commit-level acknowledgment codes (CA, CE, CR) per HL7v2 Table 0008 and rename exception classes for clarity.
  - Rename `AckError` to `AckApplicationError` (code `AE`)
  - Rename `AckReject` to `AckApplicationReject` (code `AR`)
  - Remove `AckError` and `AckReject` aliases (breaking change)
  - Add `AckCommitError` exception class (code `CE`) for commit-level errors
  - Add `AckCommitReject` exception class (code `CR`) for commit-level rejections
  - Add `AckCode` const (Table 0008), `Hl7ErrorCode` const (Table 0357), `Severity` const (Table 0516)
  - Add concrete error subclasses: `ApplicationInternalError`, `UnsupportedMessageTypeReject`, `CommitInternalError`
  - Add `toErrSegment()` method on `AckException` for building ERR segment AST
  - Add `successCode` option to `acknowledge()` for AA vs CA (defaults to `AckCode.ApplicationAccept`)
  - Make `error` and `successCode` mutually exclusive via discriminated union type
  - Add `successCode` option to `ackMiddleware()` passed through to `acknowledge()`
  - Default unknown errors in `ackMiddleware` to `ApplicationInternalError`
  - @rethinkhealth/hl7v2-ast@0.7.1
  - @rethinkhealth/hl7v2-builder@0.7.1
  - @rethinkhealth/hl7v2-util-query@0.7.1
  - @rethinkhealth/hl7v2-util-timestamp@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.0
- @rethinkhealth/hl7v2-builder@0.7.0
- @rethinkhealth/hl7v2-util-query@0.7.0
- @rethinkhealth/hl7v2-util-timestamp@0.7.0

## 0.6.0

### Patch Changes

- d94b9ff: Add `acknowledge()` function that builds spec-compliant ACK/NAK response ASTs from parsed HL7v2 messages. Supports AA (success), AE (error), and AR (reject) acknowledgment codes with optional ERR segments.
  - Add `AckException` abstract base class and `AckError` / `AckReject` subclasses with required `errorCode` and optional `severity`
  - Support `cause` option in `AckExceptionOptions` for error chain debugging
  - Derive ACK sender (MSH-3/MSH-4) from the original message's MSH-5/MSH-6 when `sending` is omitted
  - Add `processingId` option to override MSH-11 (defaults to origin message's MSH-11)
  - Add `includeErrSegment` option to control ERR segment generation (defaults to `true`)
  - Add `uid()` utility for generating MSH-10 control IDs via `nanoid`

- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.
- Updated dependencies [5e50f20]
- Updated dependencies [7763c22]
- Updated dependencies [0b57ba9]
  - @rethinkhealth/hl7v2-util-timestamp@0.6.0
  - @rethinkhealth/hl7v2-util-query@0.6.0
  - @rethinkhealth/hl7v2-builder@0.6.0
  - @rethinkhealth/hl7v2-ast@0.6.0

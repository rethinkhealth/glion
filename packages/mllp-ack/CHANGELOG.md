# @rethinkhealth/hl7v2-mllp-ack

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
- Updated dependencies [5e3d97e]
- Updated dependencies [5e3d97e]
  - @glion/ack@0.16.0
  - @glion/encode-escapes@0.16.0
  - @glion/mllp@0.16.0
  - @glion/to-hl7v2@0.16.0

## 0.15.3

### Patch Changes

- @glion/mllp@0.15.3
- @glion/ack@0.15.3
- @glion/encode-escapes@0.15.3
- @glion/to-hl7v2@0.15.3

## 0.15.2

### Patch Changes

- @glion/ack@0.15.2
- @glion/encode-escapes@0.15.2
- @glion/mllp@0.15.2
- @glion/to-hl7v2@0.15.2

## 0.15.1

### Patch Changes

- @glion/mllp@0.15.1
- @glion/ack@0.15.1
- @glion/encode-escapes@0.15.1
- @glion/to-hl7v2@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [d07bc41]
- Updated dependencies [4aa0b44]
- Updated dependencies [4af9499]
  - @glion/to-hl7v2@0.15.0
  - @glion/mllp@0.15.0
  - @glion/ack@0.15.0
  - @glion/encode-escapes@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-to-hl7v2@0.14.1
  - @rethinkhealth/hl7v2-mllp@0.14.1
  - @rethinkhealth/hl7v2-ack@0.14.1
  - @rethinkhealth/hl7v2-encode-escapes@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-mllp@0.14.0
- @rethinkhealth/hl7v2-ack@0.14.0
- @rethinkhealth/hl7v2-encode-escapes@0.14.0
- @rethinkhealth/hl7v2-to-hl7v2@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-mllp@0.13.2
- @rethinkhealth/hl7v2-ack@0.13.2
- @rethinkhealth/hl7v2-encode-escapes@0.13.2
- @rethinkhealth/hl7v2-to-hl7v2@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-to-hl7v2@0.13.1
  - @rethinkhealth/hl7v2-mllp@0.13.1
  - @rethinkhealth/hl7v2-ack@0.13.1
  - @rethinkhealth/hl7v2-encode-escapes@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-to-hl7v2@0.13.0
  - @rethinkhealth/hl7v2-encode-escapes@0.13.0
  - @rethinkhealth/hl7v2-ack@0.13.0
  - @rethinkhealth/hl7v2-mllp@0.13.0

## 0.12.0

### Patch Changes

- 565ae43: Fix ACK responses to encode escape sequences before serialization.
  - Run `hl7v2EncodeEscapes` on the ACK tree so delimiter characters in error messages are properly escaped
  - @rethinkhealth/hl7v2-mllp@0.12.0
  - @rethinkhealth/hl7v2-ack@0.12.0
  - @rethinkhealth/hl7v2-encode-escapes@0.12.0
  - @rethinkhealth/hl7v2-to-hl7v2@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-mllp@0.11.0
- @rethinkhealth/hl7v2-ack@0.11.0
- @rethinkhealth/hl7v2-to-hl7v2@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-mllp@0.10.1
- @rethinkhealth/hl7v2-ack@0.10.1
- @rethinkhealth/hl7v2-to-hl7v2@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ack@0.10.0
- @rethinkhealth/hl7v2-mllp@0.10.0
- @rethinkhealth/hl7v2-to-hl7v2@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-ack@0.9.0
  - @rethinkhealth/hl7v2-mllp@0.9.0
  - @rethinkhealth/hl7v2-to-hl7v2@0.9.0

## 0.8.0

### Minor Changes

- f3598e0: Replace constructor-option parser with `app.parser()` lifecycle stage and implement lazy pipeline execution (ADR-0013).
  - Remove `MllpOptions`, `Parser`, `ParseResult` types — `app.parser()` accepts `Hl7v2Processor` (unified `Processor<Root, Root, Root>`) directly
  - Add `ctx.ast` — synchronous access to the parsed AST for routing, ACK building, and filter functions
  - Change `ctx.tree` from a sync property to `ctx.tree()` async method — triggers `run()` (transformers) lazily on first call, cached thereafter
  - Add `ctx.result()` async method — triggers `run()` + `stringify()` lazily on first call, returns compiled output (e.g., JSON from `hl7v2Jsonify`), `undefined` when no compiler is configured
  - Change `ctx.file` from `VFile | undefined` to `VFile` — always present, diagnostics accumulate after `tree()` triggers transformers
  - Add `Hl7v2Processor` exported type alias for `Processor<Root, Root, Root>`
  - Throw `MllpError` with code `ERR_NO_PARSER` when `handle()` called without `app.parser()`
  - Change ACK middleware to use `ctx.ast` instead of `ctx.tree` for zero-async acknowledgment generation

### Patch Changes

- Updated dependencies [f3598e0]
  - @rethinkhealth/hl7v2-mllp@0.8.0
  - @rethinkhealth/hl7v2-ack@0.8.0
  - @rethinkhealth/hl7v2-to-hl7v2@0.8.0

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

- Updated dependencies [fcf9e3a]
  - @rethinkhealth/hl7v2-ack@0.7.1
  - @rethinkhealth/hl7v2-mllp@0.7.1
  - @rethinkhealth/hl7v2-to-hl7v2@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ack@0.7.0
- @rethinkhealth/hl7v2-mllp@0.7.0
- @rethinkhealth/hl7v2-to-hl7v2@0.7.0

## 0.6.0

### Patch Changes

- d94b9ff: Add `ackMiddleware()` function that wraps MLLP handlers with automatic HL7v2 ACK/NAK response generation.
  - Return AA on successful handler execution, AE on `AckError`, AR on `AckReject`
  - Convert unknown errors to AE with error code 207 (internal error)
  - Support custom `sending` and `generateId` options via `AckMiddlewareOptions`
  - Pass through handler-set responses when no error occurs

- Updated dependencies [d94b9ff]
- Updated dependencies [0f0af81]
- Updated dependencies [1f73b98]
  - @rethinkhealth/hl7v2-ack@0.6.0
  - @rethinkhealth/hl7v2-mllp@0.6.0
  - @rethinkhealth/hl7v2-to-hl7v2@0.6.0

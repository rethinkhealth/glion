# @rethinkhealth/hl7v2-util-timestamp

## 0.17.0

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

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.

## 0.14.1

## 0.14.0

## 0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.1

## 0.7.0

## 0.6.0

### Patch Changes

- 5e50f20: ### New Package: `@rethinkhealth/hl7v2-util-timestamp`

  An immutable, high-performance HL7v2 timestamp utility for parsing, formatting, and converting TS (Time Stamp) values.

  **Features:**
  - **Precision tracking** — 7 levels from year to millisecond. Parsing preserves the original precision so `Timestamp.parse("20260307").toString()` returns `"20260307"`, never `"20260307000000"`.
  - **Correct timezone handling** — Timezone offsets are applied directly to the `Date` object via `Date.UTC()`, ensuring `toDate()` always returns the correct absolute moment regardless of server timezone. No separate `timezoneOffset` metadata to lose or forget.
  - **Lossless round-trip** — Fractional seconds (up to 4 digits) are preserved exactly as parsed, even though JavaScript `Date` only supports 3-digit milliseconds.
  - **High performance** — No regex, no intermediate arrays. Uses `codePointAt` arithmetic for parsing, pre-computed lookup tables for zero-padding, and `Map`-based O(1) precision lookups. Optimized for 100K+ messages/second.
  - **Three creation methods** — `Timestamp.parse(str)` for HL7v2 strings, `Timestamp.from(date, options)` for `Date` objects, `Timestamp.now(options)` for current time.
  - **Zero dependencies** — Pure computation, ESM-only, Node.js 18+.

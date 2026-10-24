# @rethinkhealth/hl7v2-encode-escapes

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-query@0.30.0
  - @glion/util-visit@0.30.0
  - @glion/utils@0.30.0

## 0.29.0

### Patch Changes

- [#1053](https://github.com/rethinkhealth/glion/pull/1053) [`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56) Thanks [@meleksomai](https://github.com/meleksomai)! - Fix `encodeEscapes` writing an escape sequence that holds a delimiter, which made a message whose delimiters include an escape code grow on every parse and serialize round trip ([#1051](https://github.com/rethinkhealth/glion/issues/1051)).

  - Write a character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, as `\Xdd\`, with a hexadecimal digit `A`–`F` in lowercase when its uppercase form is a delimiter
  - Add `EscapeSequenceError`, thrown by `encodeEscapes`, `toHl7v2`, and `hl7v2EncodeEscapes` for a character that no escape sequence can write with the message's delimiters, and export it from `@glion/to-hl7v2`
  - Report `glion send` of such a message as an `invalid` outcome instead of exiting with an unexpected error
  - Report a withdrawn or backward-compatible field without `actual` when the message's delimiters cannot write it, instead of rejecting the lint run

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56)]:
  - @glion/utils@0.29.0
  - @glion/util-query@0.29.0
  - @glion/util-visit@0.29.0

## 0.28.0

### Minor Changes

- [#1001](https://github.com/rethinkhealth/glion/pull/1001) [`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: decode HL7v2 escape sequences while parsing and encode them while serializing, so a subcomponent `value` is always the content and a parsed message writes back as the same text.

  - `hl7v2Parser` decodes `\F\`, `\S\`, `\R\`, `\T\`, `\E\`, `\.br\`, and `\Xdd\` in every value as it tokenizes, leaving MSH-2 as it is; pass `decodeEscapes: false` to keep the wire form in the tree
  - A formatting command (`\H\`, `\N\`, `\.sp 2\`, …), a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`) stay in the value as written and are written back as they are; `hl7v2DecodeEscapes` no longer removes `\H\` and `\N\`
  - `hl7v2ToHl7v2` and `toHl7v2` write delimiters, the escape character, the segment delimiter, and other control characters in a value as escape sequences, leaving MSH-1 and MSH-2 as they are; pass `encodeEscapes: false` to write values as they are
  - `parseHL7v2` from `@glion/hl7v2` no longer runs `hl7v2DecodeEscapes`; its output is unchanged
  - Add `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` to `@glion/utils`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` are for trees handled with those options off; a parsed tree must not be decoded again
  - `hl7v2EncodeEscapes` now writes a control character other than the segment delimiter as `\Xdd\`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` leave a subcomponent without a value as it is
  - `MllpClient` and `glion send` send a message whose value holds a control character, written as `\Xdd\`, instead of rejecting it with `INVALID_MESSAGE`
  - The bytes of a `\Xdd…\` are decoded as UTF-8; a sequence whose bytes are not UTF-8, or that has an odd number of digits, stays as written

### Patch Changes

- Updated dependencies [[`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad)]:
  - @glion/utils@0.28.0
  - @glion/util-query@0.28.0
  - @glion/util-visit@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68)]:
  - @glion/utils@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @glion/utils@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

### Patch Changes

- Updated dependencies [dca5259]
  - @glion/utils@0.18.0

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

### Minor Changes

- 524bdf2: Add new `hl7v2-encode-escapes` plugin for encoding special characters as HL7v2 escape sequences at write-time. This is the inverse of `hl7v2-decode-escapes` and ensures delimiter characters in subcomponent values are safely escaped before serialization, preventing malformed messages.

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.7.0

# @rethinkhealth/hl7v2-decode-escapes

## 0.32.0

### Minor Changes

- [#1178](https://github.com/rethinkhealth/glion/pull/1178) [`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** the delimiters of a message are read from its tree, and `file.data.delimiters` is gone. A transform that changes MSH-2 now changes the delimiters the message is written with.

  - Remove `@glion/annotate-delimiters`; `delimiters()` from `@glion/util-query` reads the same delimiters from a tree
  - Change `delimiters()` to read a message as `@glion/parser` does: only a message header the message opens with declares delimiters, so a later `MSH`, or one after a batch header, is no longer read as the header ([#1172](https://github.com/rethinkhealth/glion/issues/1172))
  - Add a `fallback` argument to `delimiters()`, and add `msh()` to `@glion/util-query`
  - Change `hl7v2ToHl7v2`, `hl7v2DecodeEscapes`, and `hl7v2EncodeEscapes` to read `options.delimiters` where they take it, then MSH-1 and MSH-2, then the `delimiters` of the processor's `settings`, then `|^~\&`
  - Remove `hl7v2AnnotateDelimiters` from the `@glion/hl7v2` pipeline
  - Change `toHl7v2` to write a node other than a `Root` with the `delimiters` it is given: a delimiter left out is absent, except `field`, where it took the default
  - Write an `MSH` later in a message as any other segment in `toHl7v2`, and handle its escape sequences in `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes`; `toHl7v2` used to drop its first field
  - Add `ENCODING_CHARACTERS` to `@glion/utils`, and read MSH-2 by UTF-16 code unit in `delimiters()`, as `@glion/parser` does

- [#1169](https://github.com/rethinkhealth/glion/pull/1169) [`d2a29e4`](https://github.com/rethinkhealth/glion/commit/d2a29e4f20510c645847823cdc8c37b0ed01b96e) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** change only the characters that cannot appear in a value as they are, the separators and the control characters, and keep everything else as written in both directions, so a message read and written again is the message that was sent.

  - Decode `\F\`, `\S\`, `\R\`, and `\T\` to the separators, and the `\Xdd\` of a character below U+0020, such as `\X0D\`, to that character. Keep every other sequence in the value as written: `\E\`, `\P\`, `\H\`, `\N\`, `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define.
  - Change `\.br\` to stay as written instead of decoding to a carriage return, `\XC3A9\` to stay as written instead of decoding to `é`, and `\E\` to stay as written instead of decoding to the escape character. A value read by `@glion/parser`, `@glion/hl7v2`, the NAK and ACK text of `@glion/mllp-client`, and the output of `glion send` hold these sequences as written.
  - Write a carriage return in a value as `\X0D\` instead of `\.br\`, so `\X0D\` is no longer written back as `\.br\`. With `X`, `0`, or both `D` and `d` among the delimiters, a value holding a carriage return now throws `EscapeSequenceError`.
  - Write every escape sequence in a value as it is, so `\P\`, `\Q\`, and `\XFF\` are no longer written back as `\E\P\E\`, `\E\Q\E\`, and `\E\XFF\E\`, and `C:\temp` is no longer written as `C:\E\temp`. A data escape character is written `\E\` in the value, or `\X5C\` when `E` is a delimiter.
  - Write an escape character as `\E\` when a separator or a control character comes after it and before its closing one, or the end of the value when it has none, so that it does not pair with their escape sequences: `a\b|c` is written `a\E\b\F\c`, and a tab after a bare `\` is kept through a relay.
  - Fix `escapes.write` and `escapes.read` for a delimiter of two UTF-16 units, so `a😀b` with the field separator `😀` is written `a\F\b` instead of as it is, and `a🙂T🙂b` with the escape character `🙂` is read as `a&b` ([#1190](https://github.com/rethinkhealth/glion/issues/1190)).
  - Replace `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` in `@glion/utils` with `escapes.read(text, delimiters)` and `escapes.write(value, delimiters)`.
  - `getLength` and `@glion/lint-profile-field-max-length` count the characters a value holds, so `12\E\3`, which now stays as written, is 6 characters long, not 4.
  - Change `@glion/decode-escapes` and `@glion/encode-escapes` to apply `escapes.read` and `escapes.write` to every subcomponent value outside MSH-1 and MSH-2, with the delimiters MSH declares when no other delimiters are given, so a plugin reads and writes a value as `@glion/parser` and `@glion/to-hl7v2` do.

### Patch Changes

- [#1178](https://github.com/rethinkhealth/glion/pull/1178) [`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** a delimiter MSH-2 does not declare is absent, and the message is read without it. `MSH|^~&` declares the escape character `&` and no subcomponent separator, so `a&F&b` is the one value `a|b`, where it was read as the subcomponents `a`, `F`, and `b` ([#1170](https://github.com/rethinkhealth/glion/issues/1170)). In a message that opens `MSH|^~\`, `&` is data.

  - Change `Delimiters` in `@glion/ast`: `component`, `repetition`, `escape`, and `subcomponent` are optional, and absent when MSH-2 does not declare them
  - Change `detectDelimiters` in `@glion/parser` and `delimiters()` in `@glion/util-query` to leave out a delimiter MSH-2 does not declare, where they gave it its default; a message without a message header segment is still read with `|^~\&`
  - Add `MissingSeparatorError` to `@glion/to-hl7v2`, thrown for a field, field repetition, or component with more than one child and no separator to write them apart
  - Add `MissingEscapeCharacterError` to `@glion/utils`, a subclass of `EscapeSequenceError` that `escapes.write` throws for a separator or line break when the delimiters have no escape character, writing every other character as it is; `escapes.read` returns the text as it is

- Updated dependencies [[`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1), [`d2a29e4`](https://github.com/rethinkhealth/glion/commit/d2a29e4f20510c645847823cdc8c37b0ed01b96e), [`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1)]:
  - @glion/utils@0.32.0
  - @glion/util-query@0.32.0
  - @glion/util-visit@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.31.0
  - @glion/utils@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.30.0
  - @glion/utils@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56)]:
  - @glion/utils@0.29.0
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
  - @glion/util-visit@0.28.0

## 0.27.1

### Patch Changes

- [#994](https://github.com/rethinkhealth/glion/pull/994) [`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0) Thanks [@meleksomai](https://github.com/meleksomai)! - Decoding walks the tree with `@glion/util-visit`, and a message decodes about four times faster. `unist-util-visit` and `unist-util-visit-parents` are no longer dependencies.
- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/util-visit@0.27.1
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

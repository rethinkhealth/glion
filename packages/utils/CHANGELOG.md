# @rethinkhealth/hl7v2-utils

## 0.30.0

No changes in this release.

## 0.29.0

### Minor Changes

- [#1053](https://github.com/rethinkhealth/glion/pull/1053) [`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56) Thanks [@meleksomai](https://github.com/meleksomai)! - Fix `encodeEscapes` writing an escape sequence that holds a delimiter, which made a message whose delimiters include an escape code grow on every parse and serialize round trip ([#1051](https://github.com/rethinkhealth/glion/issues/1051)).

  - Write a character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, as `\Xdd\`, with a hexadecimal digit `A`–`F` in lowercase when its uppercase form is a delimiter
  - Add `EscapeSequenceError`, thrown by `encodeEscapes`, `toHl7v2`, and `hl7v2EncodeEscapes` for a character that no escape sequence can write with the message's delimiters, and export it from `@glion/to-hl7v2`
  - Report `glion send` of such a message as an `invalid` outcome instead of exiting with an unexpected error
  - Report a withdrawn or backward-compatible field without `actual` when the message's delimiters cannot write it, instead of rejecting the lint run

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

## 0.27.1

No changes in this release.

## 0.27.0

No changes in this release.

## 0.26.0

No changes in this release.

## 0.25.0

No changes in this release.

## 0.24.0

### Minor Changes

- [#917](https://github.com/rethinkhealth/glion/pull/917) [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68) Thanks [@meleksomai](https://github.com/meleksomai)! - A field profile mirrors its row in the HL7v2 segment attribute table. `optionality` is the OPT column, an `Optionality` from `@glion/utils` (`Optionality.Required` is `"R"`, `Optionality.Withdrawn` is `"W"`, and so on), absent where the standard records none. `repetitions` is the RP/# column, the most occurrences the field may have or `"unbounded"`, and `1` when it does not repeat. They replace `required` and `repeatable`; `requiredSequences` lists the fields whose optionality is `"R"`. `@glion/annotate-profile-fields` copies the field profile onto `field.data` as the profile gives it, `sequence` included, so `field.data` has `optionality` and `repetitions` in place of `required` and `repeatable`, and leaves out what the profile leaves out.

  Both come from HL7DB, so fields where it disagrees with the XML schemas change: DG1-2 and PR1-2 are required in v2.3.1 through v2.5.1, OBX-2 in v2.8, and fields such as ERR-6 and OBR-17 repeat a set number of times from v2.6.

  **Breaking:** `FieldProfile.required` and `FieldProfile.repeatable` are removed, and so are `required` and `repeatable` on `field.data`. Read `optionality === "R"` in place of `required`, and `repetitions !== 1` in place of `repeatable`.

  **Breaking:** `@glion/utils` exports `Optionality`, a const object and type of the OPT codes named after the standard (`Required`, `RequiredButMayBeEmpty`, `Optional`, `Conditional`, `NotUsed`, `BackwardCompatible`, `Withdrawn`), in place of `OptionalityCode`. `NotSupported` is now `NotUsed`, and `RequiredOrEmpty` is now `RequiredButMayBeEmpty`.

## 0.23.0

No changes in this release.

## 0.22.0

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.0

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

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

- d07bc41: Fix `isEmptyNode` to treat whitespace-only fields as non-empty, per the HL7v2 spec.
  - Remove `.trim()` from leaf node check — a space is valid HL7v2 data, not emptiness
  - Fix round-trip fidelity: trailing fields containing whitespace are no longer silently dropped during parsing
  - Add optional `trailingDelimiter` option to `hl7v2ToHl7v2` serializer to append a field delimiter after the last field in each segment

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

- 95e32f2: Fix `isEmptyNode` to check ALL children recursively. Previously returned `false` for multi-child nodes without checking if children were empty — e.g., `|^^|` (three empty components) was incorrectly treated as non-empty. Now aligns with HL7v2 spec: a node is empty only if no subcomponent in its subtree has a non-empty string value.

## 0.5.0

### Minor Changes

- 514f3dc: Remove `SegmentHeader` node from the AST; promote `Segment.name` as the sole source of truth for segment identifiers.

  **Breaking changes:**
  - `Segment.children` is now `Field[]` (was `[SegmentHeader, ...Field[]]`). Field indexing shifts by -1: `children[0]` is now the first field, not the segment header.
  - The `"segment-header"` node type no longer exists. Visitors targeting it must visit `"segment"` and read `node.name` instead.
  - `segment.children.slice(1)` to access fields becomes `segment.children`.

  **Why:**

  The `SegmentHeader` child node duplicated the `Segment.name` property, creating two representations of the same data that could drift out of sync. Removing it aligns `Segment` with `Group`, which already uses a `name` property — and eliminates the off-by-one indexing complexity that was a recurring source of bugs.

  **Migration:**

  ```diff
  - const name = segment.children[0].value;
  + const name = segment.name;

  - const fields = segment.children.slice(1) as Field[];
  + const fields = segment.children;

  - visit(tree, "segment-header", (node) => { ... });
  + visit(tree, "segment", (node) => { console.log(node.name); });
  ```

  See [ADR 0009](./docs/adr/0009-remove-segment-header-node.md) for full rationale and implementation details.

## 0.4.2

## 0.4.1

## 0.4.0

### Minor Changes

- 0145c27: Added conformance validation utilities for HL7v2 messages.

  New features:
  - `checkOptionality(node, optionality)`: Validate usage constraints (Required, Optional, etc.).
  - `checkCardinality(node, min, max)`: Validate field repetition counts.
  - `checkLength(node, max, min?)`: Validate content length recursively.
  - `isEmptyNode` updated to correctly handle deep empty structures (e.g., fields with multiple empty components).
  - `ValidationResult` type for standardized validation reporting.

  These utilities are stateless and can be composed to build custom validators or linters.

## 0.3.4

## 0.3.3

## 0.3.2

### Patch Changes

- 0dda39c: Update `getLength` and `getByteLength` to exclude delimiters from the calculation, only measuring the text content of the nodes.

## 0.3.1

### Patch Changes

- 2f029e2: Add `getLength` and `getByteLength` utility functions for efficiently calculating node lengths:
  - `getLength`: Returns JavaScript string length (UTF-16 code units) - useful for display, string operations, and character counting
  - `getByteLength`: Returns UTF-8 byte length - useful for wire protocol, size constraints, and memory allocation

  Both functions recursively compute the total serialized length including all children and separators, with clean functional implementations using `reduce` for consistency and elegance.

## 0.3.0

## 0.2.31

## 0.2.30

## 0.2.29

## 0.2.28

## 0.2.27

## 0.2.26

## 0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern

## 0.2.23

### Patch Changes

- f2d00ea: Enhanced error reporting by including `ancestors` in `options` and specifying position details in error messages.

## 0.2.22

## 0.2.21

### Patch Changes

- 41a4304: Add diagnostic reporting system for standardized error/warning/info messages across the HL7v2 ecosystem.

  This release introduces a new diagnostic reporting system that provides a consistent way for linters, validators, and transformers to report issues:
  - **New `report()` function**: Reports diagnostics to VFile with automatic rule ID construction, severity mapping, and context interpolation
  - **New `Diagnostic` type**: Type-safe diagnostic rule definitions with structured metadata (type, namespace, code, severity, message formatter)
  - **Rule ID format**: Automatic construction of rule IDs in the format `type:namespace:code` (e.g., `lint:field:required`)
  - **VFile integration**: Seamless integration with VFile ecosystem including position tracking, severity levels, and help URLs
  - **Comprehensive documentation**: Updated README with API documentation, usage examples, and a complete custom linter example

## 0.2.20

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

## 0.2.13

## 0.2.12

## 0.2.11

## 0.2.10

### Patch Changes

- e279025: Created a new utility to verify that a node is empty.

## 0.2.9

### Patch Changes

- d7af0e6: Refactoring to improve package management and linting

## 0.2.8

### Patch Changes

- 8d0a1ce: We now use the default carriage return character (`\r`) to delimit HL7v2 segments. If the input message uses line feed (`\n`) instead of carriage return, we automatically normalize all such occurrences to use `\r` for consistent segment handling.

## 0.2.7

## 0.2.6

## 0.2.5

## 0.2.4

### Patch Changes

- 28fef0d: New utility package for the HL7v2 ecosystem.

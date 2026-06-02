# @rethinkhealth/hl7v2-utils

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

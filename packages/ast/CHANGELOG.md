# @rethinkhealth/hl7v2-ast

## 0.18.0

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

### Patch Changes

- 1739fc8: fix(parser): handle delimiter tokens before segment header without throwing

  The parser no longer throws when delimiter characters (|, ^, ~, &) appear before
  a segment name. Instead, it creates a segment with an empty name that linters can
  inspect. This fixes crashes when users paste partial messages or hospital interfaces
  send truncated transmissions.

  The serializer emits unnamed segment content without a leading separator, preserving
  round-trip idempotency for malformed input.

## 0.14.0

## 0.13.2

## 0.13.1

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

## 0.3.4

## 0.3.3

## 0.3.2

## 0.3.1

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

## 0.2.22

## 0.2.21

## 0.2.20

### Patch Changes

- e16e519: Add a new `segment-header` node type to the HL7v2 AST ecosystem. This change clarifies segment structure, improves architectural consistency, and enhances the robustness and maintainability of the HL7v2 AST.

## 0.2.19

### Patch Changes

- 04954f1: Refactored the HL7v2 suite to introduce a new architecture for segment nodes. Segment nodes now include a dedicated `name` attribute by default, which explicitly represents the segment header. This enhancement eliminates the previous need to encode the segment header as the first field within the segment's children array. As a result, segment construction and parsing are now more intuitive, and downstream consumers can reliably access segment names via the `name` property rather than inferring them from field data. This change improves type safety, code clarity, and aligns the AST model more closely with HL7v2 semantics.
- 872815c: Expose optional `name` property on `Group` type to support named HL7v2 groups.

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

### Patch Changes

- 5e4ff5f: Fixed the definition of children for Group since it could have nested groups

## 0.2.13

### Patch Changes

- 7b1770e: minor change to AST

## 0.2.12

## 0.2.11

## 0.2.10

## 0.2.9

### Patch Changes

- d7af0e6: Refactoring to improve package management and linting

## 0.2.8

## 0.2.7

## 0.2.6

## 0.2.5

## 0.2.4

### Patch Changes

- 28fef0d: Updated the HL7v2 AST definition and its documentation to more closely follow unist guidelines, clarify node hierarchy, and provide a more structured and lossless representation of HL7v2 messages. This includes clearer definitions for node types, hierarchy, and value handling.

## 0.2.3

## 0.2.2

## 0.2.1

### Patch Changes

- dbd1b13: This PR improves the HL7v2 JSON conversion utilities and related packages. It enhances the `@rethinkhealth/hl7v2-jsonify` package to better handle edge cases, such as missing segment names, non-numeric indices, and deeply nested HL7 structures. The update also includes additional tests to ensure robust and predictable behavior. Patch releases are published for all related HL7v2 packages to reflect these improvements and maintain compatibility across the ecosystem.
- d6d2bd6: Added README.md for the ast package.

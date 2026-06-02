# @rethinkhealth/hl7v2

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

- b7bdd6a: **BREAKING:** Sunset the legacy AST-shape mode. Empty fields, repetitions, and components are now always represented with `children: []`.

  The `experimental.emptyMode` setting (which previously toggled between `"legacy"` — full skeleton with empty-string subcomponent — and `"empty"` — `children: []`) has been removed entirely. The "empty" representation is now the only behavior.

  **Why**

  The previous design routed every `f()`, `r()`, `c()` call in `@glion/builder` through `loadConfig()` from `@glion/config`, which in turn pulled `cosmiconfig` and Node-only modules (`fs`, `path`, `os`, `crypto`, `module`, `url`) into every consumer's bundle. This broke runtime portability — Workers and Deno bundles dragged in Node builtins they couldn't resolve, and even Node consumers paid the bundle-size cost. The architectural fix is to remove disk-based config discovery from leaf factory functions; sunsetting `legacy` mode is the cleanest way to do that, since it was the only thing the lookup gated.

  **Migration**

  If you parse HL7v2 messages or build them via `@glion/builder` and branch on placeholder leaves of empty fields, switch to checking `children.length === 0`:

  ```diff
  - if (field.children[0]?.children[0]?.children[0]?.value === "") { ... }
  + if (field.children.length === 0) { ... }
  ```

  `@glion/util-query`'s `value()` helper already returns `null` for empty children — most consumers using it need no change.

  **Configuration**

  Any `.hl7v2rc.*` configuration still carrying `experimental.emptyMode` will now be rejected by `@glion/config`'s schema validator. Remove that block:

  ```diff
    {
      "settings": {
  -     "experimental": { "emptyMode": "empty" },
        "delimiters": { "field": "|" }
      }
    }
  ```

  **Side effects**
  - `@glion/builder` no longer depends on `@glion/config`. Consumers' bundles shrink (cosmiconfig + dependencies dropped).
  - `@glion/parser` no longer accepts `settings.experimental` — only `settings.delimiters`.
  - `@glion/util-visit`'s test infrastructure no longer manipulates `.hl7v2rc.json` to drive builder behavior.
  - The Workers and Deno runtime adapters of `@glion/mllp-client` (PR #615, PR #616) bundle cleanly without `nodejs_compat` polyfills.

### Patch Changes

- 07c48c4: Fix round-trip data loss for trailing named-but-fieldless segments.
  The parser previously dropped any trailing segment whose payload
  contained no recognised delimiters under the active delimiter set
  (common when the input uses custom delimiters but does not start with
  `MSH`, so the `detectDelimiters` preprocessor does not fire). Once the
  trailing segment was dropped, the segment immediately preceding it
  shifted into the trailing position and got dropped on the next
  parse — cascading data loss across round-trips. Trailing segments
  with a name now survive; only lazily-opened nameless segments are
  still pruned. Surfaced via the `@glion/qa` fuzz suite
  (`round-trip.test.ts`).
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

- 1739fc8: fix(parser): handle delimiter tokens before segment header without throwing

  The parser no longer throws when delimiter characters (|, ^, ~, &) appear before
  a segment name. Instead, it creates a segment with an empty name that linters can
  inspect. This fixes crashes when users paste partial messages or hospital interfaces
  send truncated transmissions.

  The serializer emits unnamed segment content without a leading separator, preserving
  round-trip idempotency for malformed input.
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

- @rethinkhealth/hl7v2-utils@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [95e32f2]
  - @rethinkhealth/hl7v2-utils@0.6.0

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

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-utils@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.4.2

## 0.4.1

### Patch Changes

- 7a8ad97: Updated the parser to integrate the new experimental feature of emptyMode.
  - @rethinkhealth/hl7v2-utils@0.4.1

## 0.4.0

### Minor Changes

- e408529: Introduced a new experimental feature to the HL7v2 parser: "empty-array mode," which changes how empty fields and components are represented in the AST.

### Patch Changes

- 5c1aa60: Implemented the `@rethinkhealth/hl7v2-config` package that extends unified-args configuration with hl7v2-specific settings.
- Updated dependencies [0145c27]
- Updated dependencies [5c1aa60]
  - @rethinkhealth/hl7v2-utils@0.4.0
  - @rethinkhealth/hl7v2-config@0.4.0

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

- e582209: Added position tracking to the `Root` node for accurate source location information:
  - **Root position now included**: The `Root` node now includes a `position` field spanning from the first token to the last token in the document
  - **Streaming implementation**: Position tracking is performed efficiently in a streaming fashion:
    - `root.position.start` is set once on the first TEXT token
    - `root.position.end` is set once during finalization
    - Uses a separate `documentEnd` tracker that persists across segment boundaries
  - **Accurate source mapping**: The position accurately reflects the actual source text boundaries, including trailing delimiters when present
  - **Empty document handling**: Empty documents receive a default position of `{start: {line: 1, column: 1, offset: 0}, end: {line: 1, column: 1, offset: 0}}`

  This enables better error reporting, source mapping, and tooling integration by providing complete position information for the entire HL7v2 document.
  - @rethinkhealth/hl7v2-utils@0.3.0

## 0.2.31

### Patch Changes

- 92333a7: Updated the parser to ensure that every component always contains at least one subcomponent, even when empty. This change eliminates ambiguity in the parsed AST structure and includes internal refactoring for improved maintainability.

  **Impact:**
  - Empty fields/components/repetitions now consistently have a subcomponent with an empty string value (`""`)
  - Previously, empty structures could have zero subcomponents, requiring consumers to check both for missing children AND empty values
  - The structure is now predictable: `field → repetition → component → subcomponent` is always present

  **Value:**
  - **Simplified consumption**: Consumers no longer need to handle two different representations of "empty" (missing vs. empty string)
  - **Safer code**: Reduces null/undefined checking and potential runtime errors when traversing the AST
  - **Consistent semantics**: An empty field is unambiguously represented, making it easier to distinguish between "no data provided" and "parsing error"
  - **Better developer experience**: Code working with the AST becomes simpler and more maintainable

  **Internal Improvements:**
  - Extracted reusable helper functions (`createSubcomponent`, `createComponent`, `createFieldRepetition`, `createField`) to reduce code duplication
  - Simplified state management with a centralized `resetState` function
  - Reduced cognitive complexity by using early returns in nested conditionals
  - Maintained performance while improving code clarity and maintainability

  This is a non-breaking change that makes the parser output more consistent and predictable.
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

- e16e519: Add a new `segment-header` node type to the HL7v2 AST ecosystem. This change clarifies segment structure, improves architectural consistency, and enhances the robustness and maintainability of the HL7v2 AST.
  - @rethinkhealth/hl7v2-utils@0.2.20

## 0.2.19

### Patch Changes

- 04954f1: Refactored the HL7v2 suite to introduce a new architecture for segment nodes. Segment nodes now include a dedicated `name` attribute by default, which explicitly represents the segment header. This enhancement eliminates the previous need to encode the segment header as the first field within the segment's children array. As a result, segment construction and parsing are now more intuitive, and downstream consumers can reliably access segment names via the `name` property rather than inferring them from field data. This change improves type safety, code clarity, and aligns the AST model more closely with HL7v2 semantics.
  - @rethinkhealth/hl7v2-utils@0.2.19

## 0.2.18

### Patch Changes

- c439092: Minor fix to the configuration of HL7v2 parser to allow passing partial demilter object as an option.
- c439092: Minor fix
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

- cd49b6f: Added `position` information to all nodes in the HL7v2 AST. Each node now includes a `position` property that indicates the start and end offsets (line, column, and character offset) of the node's value within the original HL7v2 message. This enables precise mapping between parsed data and the source message, supporting advanced features like error reporting, highlighting, and traceability.
  - @rethinkhealth/hl7v2-utils@0.2.7

## 0.2.6

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.2.6

## 0.2.5

### Patch Changes

- 6a4d5b8: Several improvements to the HL7v2 package, focusing on integrating the HL7v2 escape sequence decoder, enhancing test coverage with Vitest, and ensuring the parser uses default preprocessors.
- c2eb48c: Updates to the HL7v2 parser and tokenizer to improve how the MSH segment is tokenized and parsed, specifically separating the field delimiter (MSH.1) from the encoding characters (MSH.2). It also simplifies the tokenizer API and updates related tests for correctness.
- 93d9197: Refactored and improved the HL7v2 parser's preprocessing workflow, making the preprocessor pipeline more explicit and type-safe. The changes simplify how preprocessing steps are configured and applied, and update related types and tests for consistency.
  - @rethinkhealth/hl7v2-utils@0.2.5

## 0.2.4

### Patch Changes

- b4b9944: Refactored to remove async management, as unified's processing pipeline is inherently synchronous and does not support asynchronous plugins or workflows.
- 28fef0d: The parser `hl7v2-parser` and the `hl7v2-jsonify` ecosystem have been updated to support more complex HL7v2 message structures and to improve efficiency:
  - **Parser Enhancements**:
    - The parser now more closely follows the [unist](https://github.com/syntax-tree/unist) guidelines, providing a clearer and more structured AST (Abstract Syntax Tree) for HL7v2 messages.
    - Node types, hierarchy, and value handling have been clarified and made more consistent, ensuring a lossless and predictable representation of HL7v2 data.
    - Edge cases such as trailing delimiters, empty fields, and repeated segments are handled more robustly, resulting in more accurate parsing of real-world HL7v2 messages.
    - Internal processing has been optimized to reduce unnecessary allocations and improve parsing speed, especially for large or complex messages.

  - **`hl7v2-jsonify` Improvements**:
    - The JSON conversion logic now leverages the improved AST, enabling more accurate and flexible transformation of HL7v2 messages into JSON.
    - Support for advanced HL7v2 constructs (such as nested repetitions and components) has been expanded, making the output more faithful to the original message structure.
    - Performance optimizations reduce memory usage and processing time when converting large batches of messages.

  These changes make the parser and jsonify tools more reliable and efficient for complex HL7v2 processing tasks, and provide a stronger foundation for downstream analytics and interoperability.

- Updated dependencies [28fef0d]
  - @rethinkhealth/hl7v2-utils@0.2.4

## 0.2.3

## 0.2.2

## 0.2.1

### Patch Changes

- dbd1b13: This PR improves the HL7v2 JSON conversion utilities and related packages. It enhances the `@rethinkhealth/hl7v2-jsonify` package to better handle edge cases, such as missing segment names, non-numeric indices, and deeply nested HL7 structures. The update also includes additional tests to ensure robust and predictable behavior. Patch releases are published for all related HL7v2 packages to reflect these improvements and maintain compatibility across the ecosystem.
- a25e1c4: Improve HL7v2 message parsing logic for better delimiter detection and position tracking. Fix minor bugs affecting empty and whitespace-only message handling.

## 0.2.0

### Minor Changes

- 813d884: Update to a monorepo package architectue

### Patch Changes

- dfd8eeb: **🚨 Breaking Changes**
  - Replaced legacy key/value HL7v2 parser with a **DOM-like Unist-compatible tree** (`HL7v2Node`).
  - Parsing now returns a `message` node with `children` representing segments, fields, components, and subcomponents.
  - All nodes now include a `position` object with `line`, `column`, and `offset` for precise source mapping.

  **✨ New Features**
  - **Lossless Round-Trip**: Parser preserves delimiters and exact positions for perfect serialization via `serializeHL7Tree`.
  - **Auto-Detect Delimiters**: `MSH-1` and `MSH-2` are now parsed to configure field, component, repetition, and subcomponent separators automatically.
  - **Custom Delimiters**: Pass `ParseOptions.delimiters` to override any delimiter.
  - **Line/Column Tracking**: Every node now includes `position.start` and `position.end` with 1-based line/column and 0-based offsets.
  - **Unist Compatibility**: Output conforms to [Unist](https://github.com/syntax-tree/unist) spec for integration with Unified pipelines.

  **🛠 Internal**
  - Removed regex-based segment splitting in favor of optimized string split for performance.
  - Refactored parser core to allow plugins such as validation, annotation, and transformation stages.
  - Added `Delimiters` type and default constants.

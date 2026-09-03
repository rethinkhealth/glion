# @rethinkhealth/hl7v2-builder

## 0.18.0

### Patch Changes

- @glion/ast@0.18.0

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0

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

- Updated dependencies [5e3d97e]
  - @glion/ast@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/config@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/config@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/config@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/ast@0.15.0
  - @glion/config@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-config@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-config@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-config@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-config@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-config@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.12.0
- @rethinkhealth/hl7v2-config@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-config@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.1
- @rethinkhealth/hl7v2-config@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-config@0.10.0

## 0.9.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.9.0
- @rethinkhealth/hl7v2-config@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.8.0
- @rethinkhealth/hl7v2-config@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.1
- @rethinkhealth/hl7v2-config@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.0
- @rethinkhealth/hl7v2-config@0.7.0

## 0.6.0

### Patch Changes

- @rethinkhealth/hl7v2-config@0.6.0
- @rethinkhealth/hl7v2-ast@0.6.0

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
  - @rethinkhealth/hl7v2-ast@0.5.0
  - @rethinkhealth/hl7v2-config@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.4.2
- @rethinkhealth/hl7v2-config@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [7a8ad97]
- Updated dependencies [7a8ad97]
  - @rethinkhealth/hl7v2-config@0.4.1
  - @rethinkhealth/hl7v2-ast@0.4.1

## 0.4.0

### Patch Changes

- 6decf7c: Introduced the experimental feature for `emptyMode`.
- Updated dependencies [5c1aa60]
  - @rethinkhealth/hl7v2-config@0.4.0
  - @rethinkhealth/hl7v2-ast@0.4.0

## 0.3.4

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.3.4

## 0.3.3

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.3.3

## 0.3.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.3.2

## 0.3.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.3.1

## 0.3.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.3.0

## 0.2.31

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.31

## 0.2.30

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.30

## 0.2.29

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.29

## 0.2.28

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.28

## 0.2.27

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.27

## 0.2.26

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.26

## 0.2.25

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern
- Updated dependencies [8385da0]
  - @rethinkhealth/hl7v2-ast@0.2.24

## 0.2.23

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.23

## 0.2.22

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.22

## 0.2.21

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.21

## 0.2.20

### Patch Changes

- e16e519: Add a new `segment-header` node type to the HL7v2 AST ecosystem. This change clarifies segment structure, improves architectural consistency, and enhances the robustness and maintainability of the HL7v2 AST.
- Updated dependencies [e16e519]
  - @rethinkhealth/hl7v2-ast@0.2.20

## 0.2.19

### Patch Changes

- 04954f1: Refactored the HL7v2 suite to introduce a new architecture for segment nodes. Segment nodes now include a dedicated `name` attribute by default, which explicitly represents the segment header. This enhancement eliminates the previous need to encode the segment header as the first field within the segment's children array. As a result, segment construction and parsing are now more intuitive, and downstream consumers can reliably access segment names via the `name` property rather than inferring them from field data. This change improves type safety, code clarity, and aligns the AST model more closely with HL7v2 semantics.
- Updated dependencies [04954f1]
- Updated dependencies [872815c]
  - @rethinkhealth/hl7v2-ast@0.2.19

## 0.2.18

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.18

## 0.2.17

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.17

## 0.2.16

### Patch Changes

- 39d3125: New package that provides a tiny set of helpers for assembling HL7v2 abstract syntax trees and follows the [`@rethinkhealth/hl7v2-ast`](../hl7v2-ast/) schema. The helpers wrap [`unist-builder`](https://github.com/syntax-tree/unist-builder) so you can build trees with a couple of function calls instead of manually nesting nodes.
  - @rethinkhealth/hl7v2-ast@0.2.16

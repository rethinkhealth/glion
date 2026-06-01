# @rethinkhealth/hl7v2-util-visit

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

### Patch Changes

- 5c6109e: Refactor visitor to wrap unist-util-visit-parents with HL7v2-specific context

  **BREAKING CHANGE**: The visitor callback signature has changed from `(node, path)` to `(node, ancestors, info)`.

  ### Architecture Change

  The implementation now wraps `unist-util-visit-parents` (battle-tested with 50M+ weekly downloads) instead of implementing custom traversal. This provides:
  - ✅ Proven traversal logic (EXIT/SKIP handling, edge cases)
  - ✅ Mutation support (inherited from unist)
  - ✅ Reverse traversal support (available via underlying library)
  - ✅ Smaller, cleaner codebase (~120 lines vs ~180 lines)
  - ✅ Ecosystem compatibility (works with other unist utilities)

  ### Before

  ```typescript
  visit(ast, (node, path) => {
    const entry = path.at(-1);
    console.log(entry?.data?.header, entry?.level);
  });
  ```

  ### After

  ```typescript
  visit(ast, (node, ancestors, info) => {
    console.log(info.metadata?.header, info.depth);
  });
  ```

  ### Changes
  - **New callback signature**: `(node, ancestors, info)` instead of `(node, path)`
    - `ancestors`: Array of ancestor nodes from root to parent (no wrapper objects)
    - `info`: Pre-computed HL7v2 context `{ index, sequence, depth, metadata }`
  - **Delegates core traversal**: Built on top of `unist-util-visit-parents`
  - **Removed PathEntry**: No longer wraps nodes in PathEntry objects
  - **Direct ancestor access**: `ancestors.at(-1)` gives parent node directly
  - **Optimized index computation**: O(n) pre-computed map instead of O(n²) indexOf calls
  - **VisitInfo structure**:
    - `index`: 0-based index among siblings (tree position, not filtered position)
    - `sequence`: 1-based sequence (segment-header = 0, fields = 1,2,3...)
    - `depth`: 1-based depth in tree (root = 1)
    - `metadata`: Extracted metadata (header for segments, name for groups)

  ### Performance Improvements
  - **O(n) index pre-computation**: One-time upfront cost for child index map
  - **O(1) index lookups**: Avoids O(n²) `indexOf()` anti-pattern
  - **Battle-tested traversal**: Inherits optimizations from unist ecosystem

  ### Migration Guide

  | Old API                                | New API                                     |
  | -------------------------------------- | ------------------------------------------- |
  | `path.at(-1)?.node`                    | `ancestors.at(-1)` or just use `node`       |
  | `path.at(-1)?.level`                   | `info.depth`                                |
  | `path.at(-1)?.index`                   | `info.sequence`                             |
  | `path.at(-1)?.data?.header`            | `info.metadata?.header`                     |
  | `path.filter(e => e.type === 'group')` | `ancestors.filter(n => n.type === 'group')` |

  ### Important Note

  `info.index` and `info.sequence` represent the node's **position in the tree**, not its position among filtered results. For example:

  ```typescript
  // Structure: MSH with fields 1,2,3,4 - filter matches only field 3
  visit(
    ast,
    (n) => n.type === "field" && hasContent(n),
    (node, ancestors, info) => {
      console.log(info.sequence); // => 3 (tree position, not "1st match")
    }
  );
  ```

  This is correct because HL7v2 paths like `PID.3` refer to tree positions.

## 0.4.1

## 0.4.0

## 0.3.4

### Patch Changes

- 4a4b4ba: Updated the dynamic typing of the HL7v2 packages.

## 0.3.3

### Patch Changes

- 6fb9f25: Added a new package, which provides a type-safe, pure functional visitor pattern for traversing HL7v2 AST trees.

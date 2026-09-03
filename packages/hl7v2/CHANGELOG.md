# @rethinkhealth/hl7v2

## 0.18.0

### Patch Changes

- Updated dependencies [e260ee4]
  - @glion/parser@0.18.0
  - @glion/preset-lint-recommended@0.18.0
  - @glion/ast@0.18.0
  - @glion/decode-escapes@0.18.0
  - @glion/jsonify@0.18.0
  - @glion/preset-lint-profile-recommended@0.18.0

## 0.17.0

### Patch Changes

- @glion/ast@0.17.0
- @glion/decode-escapes@0.17.0
- @glion/jsonify@0.17.0
- @glion/parser@0.17.0
- @glion/preset-lint-profile-recommended@0.17.0
- @glion/preset-lint-recommended@0.17.0

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
- Updated dependencies [07c48c4]
- Updated dependencies [b7bdd6a]
  - @glion/ast@0.16.0
  - @glion/decode-escapes@0.16.0
  - @glion/jsonify@0.16.0
  - @glion/parser@0.16.0
  - @glion/preset-lint-profile-recommended@0.16.0
  - @glion/preset-lint-recommended@0.16.0

## 0.15.3

### Patch Changes

- 5fff042: Workspace tooling and documentation cleanup following the README standardization arc (Phases 1–4, released in 0.15.2 alongside the publint packaging-hygiene fix). All public `@glion/*` packages now have template-compliant READMEs on npm, and CI enforces the template on every PR going forward.
  - **Generator template.** `turbo gen package` now scaffolds new packages with the `publint` script and devDep, so newly created packages automatically participate in the packaging-check CI step (#602).
  - **Contributor guidance.** `CLAUDE.md` refreshed with the current `@glion/*` package catalog and the `packages/` vs. `tools/` split introduced during the README standardization (#601).
  - **TSConfig base.** The shared `@glion/tsconfig` base no longer sets `composite`, eliminating stale `tsbuildinfo` issues when rebuilding after source edits (#603). Consumers that extend `@glion/tsconfig/library.json` for standard compilation are unaffected; consumers relying on TypeScript project-references may need to declare `composite` explicitly in their own `tsconfig.json`.

  No runtime API changes.
  - @glion/ast@0.15.3
  - @glion/decode-escapes@0.15.3
  - @glion/jsonify@0.15.3
  - @glion/parser@0.15.3
  - @glion/preset-lint-profile-recommended@0.15.3
  - @glion/preset-lint-recommended@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/decode-escapes@0.15.2
- @glion/jsonify@0.15.2
- @glion/parser@0.15.2
- @glion/preset-lint-profile-recommended@0.15.2
- @glion/preset-lint-recommended@0.15.2

## 0.15.1

### Patch Changes

- 3ea71c2: Fix npm sigstore provenance verification by normalizing the `repository` field in every publishable package.json to the object form with a full GitHub URL and a `directory` subpath:

  ```json
  {
    "type": "git",
    "url": "git+https://github.com/rethinkhealth/glion.git",
    "directory": "packages/<name>"
  }
  ```

  Previously, most packages used the bare string shorthand `"rethinkhealth/glion.git"`, and `@glion/annotate-delimiters` had no `repository` field at all. npm's sigstore provenance check couldn't resolve either into a URL matching the OIDC claim (`https://github.com/rethinkhealth/glion`), causing CI publish to fail with:

  ```
  E422 Unprocessable Entity - PUT https://registry.npmjs.org/@glion%2fannotate-delimiters
  Error verifying sigstore provenance bundle:
  "repository.url" is "", expected to match "https://github.com/rethinkhealth/glion" from provenance
  ```

  No runtime or API changes.
  - @glion/ast@0.15.1
  - @glion/decode-escapes@0.15.1
  - @glion/jsonify@0.15.1
  - @glion/parser@0.15.1
  - @glion/preset-lint-profile-recommended@0.15.1
  - @glion/preset-lint-recommended@0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/ast@0.15.0
  - @glion/parser@0.15.0
  - @glion/jsonify@0.15.0
  - @glion/decode-escapes@0.15.0
  - @glion/preset-lint-profile-recommended@0.15.0
  - @glion/preset-lint-recommended@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-parser@0.14.1
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.14.1
  - @rethinkhealth/hl7v2-decode-escapes@0.14.1
  - @rethinkhealth/hl7v2-jsonify@0.14.1
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.14.0
- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-decode-escapes@0.14.0
- @rethinkhealth/hl7v2-jsonify@0.14.0
- @rethinkhealth/hl7v2-parser@0.14.0
- @rethinkhealth/hl7v2-preset-lint-recommended@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.13.2
- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-decode-escapes@0.13.2
- @rethinkhealth/hl7v2-jsonify@0.13.2
- @rethinkhealth/hl7v2-parser@0.13.2
- @rethinkhealth/hl7v2-preset-lint-recommended@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-parser@0.13.1
  - @rethinkhealth/hl7v2-jsonify@0.13.1
  - @rethinkhealth/hl7v2-decode-escapes@0.13.1
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.13.1
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

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

- Updated dependencies [f411ebf]
- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.13.0
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-parser@0.13.0
  - @rethinkhealth/hl7v2-decode-escapes@0.13.0
  - @rethinkhealth/hl7v2-jsonify@0.13.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [ebb5944]
- Updated dependencies [1ef2a1f]
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.12.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.12.0
  - @rethinkhealth/hl7v2-ast@0.12.0
  - @rethinkhealth/hl7v2-decode-escapes@0.12.0
  - @rethinkhealth/hl7v2-jsonify@0.12.0
  - @rethinkhealth/hl7v2-parser@0.12.0

## 0.11.0

### Minor Changes

- 10806f6: Remove hl7v2-message-structure plugin from the default pipeline

  The `hl7v2-message-structure` plugin has been removed. It previously inferred MSH-9.3 from MSH-9.1 + MSH-9.2 and mutated the AST, which broke round-trip serialization fidelity for messages without MSH-9.3 (e.g., v2.3 messages).

  Consumers that read MSH-9.3 from the AST (segment-order lint rule, MLLP context) will now only see it when the original message includes it. Message structure resolution will be addressed separately via a shared utility function.

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-decode-escapes@0.11.0
- @rethinkhealth/hl7v2-jsonify@0.11.0
- @rethinkhealth/hl7v2-parser@0.11.0
- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.11.0
- @rethinkhealth/hl7v2-preset-lint-recommended@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-message-structure@0.10.1
- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.10.1
- @rethinkhealth/hl7v2-ast@0.10.1
- @rethinkhealth/hl7v2-decode-escapes@0.10.1
- @rethinkhealth/hl7v2-jsonify@0.10.1
- @rethinkhealth/hl7v2-parser@0.10.1
- @rethinkhealth/hl7v2-preset-lint-recommended@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-decode-escapes@0.10.0
- @rethinkhealth/hl7v2-jsonify@0.10.0
- @rethinkhealth/hl7v2-message-structure@0.10.0
- @rethinkhealth/hl7v2-parser@0.10.0
- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.10.0
- @rethinkhealth/hl7v2-preset-lint-recommended@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-message-structure@0.9.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.9.0
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-decode-escapes@0.9.0
  - @rethinkhealth/hl7v2-jsonify@0.9.0
  - @rethinkhealth/hl7v2-parser@0.9.0

## 0.8.0

### Patch Changes

- @rethinkhealth/hl7v2-message-structure@0.8.0
- @rethinkhealth/hl7v2-preset-lint-recommended@0.8.0
- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.8.0
- @rethinkhealth/hl7v2-ast@0.8.0
- @rethinkhealth/hl7v2-decode-escapes@0.8.0
- @rethinkhealth/hl7v2-jsonify@0.8.0
- @rethinkhealth/hl7v2-parser@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.1
- @rethinkhealth/hl7v2-decode-escapes@0.7.1
- @rethinkhealth/hl7v2-jsonify@0.7.1
- @rethinkhealth/hl7v2-message-structure@0.7.1
- @rethinkhealth/hl7v2-parser@0.7.1
- @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.7.1
- @rethinkhealth/hl7v2-preset-lint-recommended@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [12dbe59]
- Updated dependencies [951dfca]
  - @rethinkhealth/hl7v2-decode-escapes@0.7.0
  - @rethinkhealth/hl7v2-ast@0.7.0
  - @rethinkhealth/hl7v2-jsonify@0.7.0
  - @rethinkhealth/hl7v2-message-structure@0.7.0
  - @rethinkhealth/hl7v2-parser@0.7.0
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.7.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.7.0

## 0.6.0

### Minor Changes

- 7bef400: Add profile-based lint preset to the default `parseHL7v2` pipeline. Messages are now validated against HL7v2 field definitions, datatype constraints, and table values out of the box.
- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.

### Patch Changes

- Updated dependencies [bd43116]
- Updated dependencies [1f73b98]
  - @rethinkhealth/hl7v2-preset-lint-profile-recommended@0.6.0
  - @rethinkhealth/hl7v2-message-structure@0.6.0
  - @rethinkhealth/hl7v2-decode-escapes@0.6.0
  - @rethinkhealth/hl7v2-parser@0.6.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.6.0
  - @rethinkhealth/hl7v2-jsonify@0.6.0
  - @rethinkhealth/hl7v2-ast@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-ast@0.5.0
  - @rethinkhealth/hl7v2-parser@0.5.0
  - @rethinkhealth/hl7v2-jsonify@0.5.0
  - @rethinkhealth/hl7v2-annotate-message@0.5.0
  - @rethinkhealth/hl7v2-annotate-message-structure@0.5.0
  - @rethinkhealth/hl7v2-decode-escapes@0.5.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-annotate-message@0.4.2
- @rethinkhealth/hl7v2-annotate-message-structure@0.4.2
- @rethinkhealth/hl7v2-ast@0.4.2
- @rethinkhealth/hl7v2-decode-escapes@0.4.2
- @rethinkhealth/hl7v2-jsonify@0.4.2
- @rethinkhealth/hl7v2-parser@0.4.2
- @rethinkhealth/hl7v2-preset-lint-recommended@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [7a8ad97]
  - @rethinkhealth/hl7v2-parser@0.4.1
  - @rethinkhealth/hl7v2-annotate-message@0.4.1
  - @rethinkhealth/hl7v2-annotate-message-structure@0.4.1
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.4.1
  - @rethinkhealth/hl7v2-decode-escapes@0.4.1
  - @rethinkhealth/hl7v2-jsonify@0.4.1
  - @rethinkhealth/hl7v2-ast@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e408529]
- Updated dependencies [5c1aa60]
  - @rethinkhealth/hl7v2-parser@0.4.0
  - @rethinkhealth/hl7v2-annotate-message@0.4.0
  - @rethinkhealth/hl7v2-annotate-message-structure@0.4.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.4.0
  - @rethinkhealth/hl7v2-decode-escapes@0.4.0
  - @rethinkhealth/hl7v2-jsonify@0.4.0
  - @rethinkhealth/hl7v2-ast@0.4.0

## 0.3.4

### Patch Changes

- @rethinkhealth/hl7v2-annotate-message@0.3.4
- @rethinkhealth/hl7v2-annotate-message-structure@0.3.4
- @rethinkhealth/hl7v2-ast@0.3.4
- @rethinkhealth/hl7v2-decode-escapes@0.3.4
- @rethinkhealth/hl7v2-jsonify@0.3.4
- @rethinkhealth/hl7v2-parser@0.3.4
- @rethinkhealth/hl7v2-preset-lint-recommended@0.3.4

## 0.3.3

### Patch Changes

- @rethinkhealth/hl7v2-annotate-message@0.3.3
- @rethinkhealth/hl7v2-annotate-message-structure@0.3.3
- @rethinkhealth/hl7v2-ast@0.3.3
- @rethinkhealth/hl7v2-decode-escapes@0.3.3
- @rethinkhealth/hl7v2-jsonify@0.3.3
- @rethinkhealth/hl7v2-parser@0.3.3
- @rethinkhealth/hl7v2-preset-lint-recommended@0.3.3

## 0.3.2

### Patch Changes

- @rethinkhealth/hl7v2-decode-escapes@0.3.2
- @rethinkhealth/hl7v2-parser@0.3.2
- @rethinkhealth/hl7v2-preset-lint-recommended@0.3.2
- @rethinkhealth/hl7v2-annotate-message@0.3.2
- @rethinkhealth/hl7v2-annotate-message-structure@0.3.2
- @rethinkhealth/hl7v2-ast@0.3.2
- @rethinkhealth/hl7v2-jsonify@0.3.2

## 0.3.1

### Patch Changes

- @rethinkhealth/hl7v2-decode-escapes@0.3.1
- @rethinkhealth/hl7v2-parser@0.3.1
- @rethinkhealth/hl7v2-preset-lint-recommended@0.3.1
- @rethinkhealth/hl7v2-annotate-message@0.3.1
- @rethinkhealth/hl7v2-annotate-message-structure@0.3.1
- @rethinkhealth/hl7v2-ast@0.3.1
- @rethinkhealth/hl7v2-jsonify@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e582209]
  - @rethinkhealth/hl7v2-parser@0.3.0
  - @rethinkhealth/hl7v2-annotate-message@0.3.0
  - @rethinkhealth/hl7v2-annotate-message-structure@0.3.0
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.3.0
  - @rethinkhealth/hl7v2-ast@0.3.0
  - @rethinkhealth/hl7v2-decode-escapes@0.3.0
  - @rethinkhealth/hl7v2-jsonify@0.3.0

## 0.2.31

### Patch Changes

- Updated dependencies [92333a7]
  - @rethinkhealth/hl7v2-parser@0.2.31
  - @rethinkhealth/hl7v2-annotate-message@0.2.31
  - @rethinkhealth/hl7v2-annotate-message-structure@0.2.31
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.31
  - @rethinkhealth/hl7v2-ast@0.2.31
  - @rethinkhealth/hl7v2-decode-escapes@0.2.31
  - @rethinkhealth/hl7v2-jsonify@0.2.31

## 0.2.30

### Patch Changes

- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.30
- @rethinkhealth/hl7v2-annotate-message@0.2.30
- @rethinkhealth/hl7v2-annotate-message-structure@0.2.30
- @rethinkhealth/hl7v2-ast@0.2.30
- @rethinkhealth/hl7v2-decode-escapes@0.2.30
- @rethinkhealth/hl7v2-jsonify@0.2.30
- @rethinkhealth/hl7v2-parser@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies [6d2be85]
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.29
  - @rethinkhealth/hl7v2-annotate-message@0.2.29
  - @rethinkhealth/hl7v2-annotate-message-structure@0.2.29
  - @rethinkhealth/hl7v2-ast@0.2.29
  - @rethinkhealth/hl7v2-decode-escapes@0.2.29
  - @rethinkhealth/hl7v2-jsonify@0.2.29
  - @rethinkhealth/hl7v2-parser@0.2.29

## 0.2.28

### Patch Changes

- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.28
- @rethinkhealth/hl7v2-annotate-message@0.2.28
- @rethinkhealth/hl7v2-annotate-message-structure@0.2.28
- @rethinkhealth/hl7v2-ast@0.2.28
- @rethinkhealth/hl7v2-decode-escapes@0.2.28
- @rethinkhealth/hl7v2-jsonify@0.2.28
- @rethinkhealth/hl7v2-parser@0.2.28

## 0.2.27

### Patch Changes

- 7b02e84: Added support to message structure annotator in HL7v2 pipeline
  - @rethinkhealth/hl7v2-annotate-message@0.2.27
  - @rethinkhealth/hl7v2-annotate-message-structure@0.2.27
  - @rethinkhealth/hl7v2-ast@0.2.27
  - @rethinkhealth/hl7v2-decode-escapes@0.2.27
  - @rethinkhealth/hl7v2-jsonify@0.2.27
  - @rethinkhealth/hl7v2-parser@0.2.27
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies [8584465]
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.26
  - @rethinkhealth/hl7v2-annotate-message@0.2.26
  - @rethinkhealth/hl7v2-ast@0.2.26
  - @rethinkhealth/hl7v2-decode-escapes@0.2.26
  - @rethinkhealth/hl7v2-jsonify@0.2.26
  - @rethinkhealth/hl7v2-parser@0.2.26

## 0.2.25

### Patch Changes

- 4860172: Added `@rethinkhealth/hl7v2-annotate-message` plugin to enable annotation of HL7v2 AST with message metadata in unified pipelines.
- Updated dependencies [4860172]
  - @rethinkhealth/hl7v2-annotate-message@0.2.25
  - @rethinkhealth/hl7v2-ast@0.2.25
  - @rethinkhealth/hl7v2-decode-escapes@0.2.25
  - @rethinkhealth/hl7v2-jsonify@0.2.25
  - @rethinkhealth/hl7v2-parser@0.2.25
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern
- Updated dependencies [8385da0]
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.24
  - @rethinkhealth/hl7v2-decode-escapes@0.2.24
  - @rethinkhealth/hl7v2-jsonify@0.2.24
  - @rethinkhealth/hl7v2-parser@0.2.24
  - @rethinkhealth/hl7v2-ast@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies [a8d56ec]
  - @rethinkhealth/hl7v2-jsonify@0.2.23
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.23
  - @rethinkhealth/hl7v2-decode-escapes@0.2.23
  - @rethinkhealth/hl7v2-parser@0.2.23
  - @rethinkhealth/hl7v2-ast@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies [9523158]
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.22
  - @rethinkhealth/hl7v2-ast@0.2.22
  - @rethinkhealth/hl7v2-decode-escapes@0.2.22
  - @rethinkhealth/hl7v2-jsonify@0.2.22
  - @rethinkhealth/hl7v2-parser@0.2.22

## 0.2.21

### Patch Changes

- @rethinkhealth/hl7v2-decode-escapes@0.2.21
- @rethinkhealth/hl7v2-parser@0.2.21
- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.21
- @rethinkhealth/hl7v2-ast@0.2.21
- @rethinkhealth/hl7v2-jsonify@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies [e16e519]
  - @rethinkhealth/hl7v2-jsonify@0.2.20
  - @rethinkhealth/hl7v2-parser@0.2.20
  - @rethinkhealth/hl7v2-ast@0.2.20
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.20
  - @rethinkhealth/hl7v2-decode-escapes@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies [04954f1]
- Updated dependencies [872815c]
  - @rethinkhealth/hl7v2-parser@0.2.19
  - @rethinkhealth/hl7v2-jsonify@0.2.19
  - @rethinkhealth/hl7v2-ast@0.2.19
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.19
  - @rethinkhealth/hl7v2-decode-escapes@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [c439092]
- Updated dependencies [c439092]
  - @rethinkhealth/hl7v2-parser@0.2.18
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.18
  - @rethinkhealth/hl7v2-ast@0.2.18
  - @rethinkhealth/hl7v2-decode-escapes@0.2.18
  - @rethinkhealth/hl7v2-jsonify@0.2.18

## 0.2.17

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.17
- @rethinkhealth/hl7v2-decode-escapes@0.2.17
- @rethinkhealth/hl7v2-jsonify@0.2.17
- @rethinkhealth/hl7v2-parser@0.2.17
- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.17

## 0.2.16

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.16
- @rethinkhealth/hl7v2-decode-escapes@0.2.16
- @rethinkhealth/hl7v2-jsonify@0.2.16
- @rethinkhealth/hl7v2-parser@0.2.16
- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.16

## 0.2.15

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.2.15
- @rethinkhealth/hl7v2-decode-escapes@0.2.15
- @rethinkhealth/hl7v2-jsonify@0.2.15
- @rethinkhealth/hl7v2-parser@0.2.15
- @rethinkhealth/hl7v2-preset-lint-recommended@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies [5e4ff5f]
  - @rethinkhealth/hl7v2-ast@0.2.14
  - @rethinkhealth/hl7v2-decode-escapes@0.2.14
  - @rethinkhealth/hl7v2-jsonify@0.2.14
  - @rethinkhealth/hl7v2-parser@0.2.14
  - @rethinkhealth/hl7v2-preset-lint-recommended@0.2.14

## 0.2.13

### Patch Changes

- 7b1770e: Minor fixes to hl7v2
- Updated dependencies [7b1770e]
  - @rethinkhealth/hl7v2-ast@0.2.13
  - @rethinkhealth/hl7v2-decode-escapes@0.2.13
  - @rethinkhealth/hl7v2-jsonify@0.2.13
  - @rethinkhealth/hl7v2-parser@0.2.13

## 0.2.12

### Patch Changes

- 6da8dde: Minor fixes to hl7v2
  - @rethinkhealth/hl7v2-ast@0.2.12
  - @rethinkhealth/hl7v2-decode-escapes@0.2.12
  - @rethinkhealth/hl7v2-jsonify@0.2.12
  - @rethinkhealth/hl7v2-parser@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [2b86a32]
  - @rethinkhealth/hl7v2-decode-escapes@0.2.11
  - @rethinkhealth/hl7v2-parser@0.2.11
  - @rethinkhealth/hl7v2-ast@0.2.11
  - @rethinkhealth/hl7v2-jsonify@0.2.11

## 0.2.10

### Patch Changes

- @rethinkhealth/hl7v2-decode-escapes@0.2.10
- @rethinkhealth/hl7v2-parser@0.2.10
- @rethinkhealth/hl7v2-ast@0.2.10
- @rethinkhealth/hl7v2-jsonify@0.2.10

## 0.2.9

### Patch Changes

- d7af0e6: Refactoring to improve package management and linting
- Updated dependencies [d7af0e6]
  - @rethinkhealth/hl7v2-decode-escapes@0.2.9
  - @rethinkhealth/hl7v2-jsonify@0.2.9
  - @rethinkhealth/hl7v2-parser@0.2.9
  - @rethinkhealth/hl7v2-ast@0.2.9

## 0.2.8

### Patch Changes

- @rethinkhealth/hl7v2-decode-escapes@0.2.8
- @rethinkhealth/hl7v2-parser@0.2.8
- @rethinkhealth/hl7v2-ast@0.2.8
- @rethinkhealth/hl7v2-jsonify@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies [cd49b6f]
- Updated dependencies [cd49b6f]
  - @rethinkhealth/hl7v2-jsonify@0.2.7
  - @rethinkhealth/hl7v2-parser@0.2.7
  - @rethinkhealth/hl7v2-ast@0.2.7
  - @rethinkhealth/hl7v2-decode-escapes@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies [b7ccb39]
  - @rethinkhealth/hl7v2-jsonify@0.2.6
  - @rethinkhealth/hl7v2-parser@0.2.6
  - @rethinkhealth/hl7v2-ast@0.2.6
  - @rethinkhealth/hl7v2-decode-escapes@0.2.6

## 0.2.5

### Patch Changes

- 6a4d5b8: Several improvements to the HL7v2 package, focusing on integrating the HL7v2 escape sequence decoder, enhancing test coverage with Vitest, and ensuring the parser uses default preprocessors.
- Updated dependencies [6a4d5b8]
- Updated dependencies [c2eb48c]
- Updated dependencies [09597f7]
- Updated dependencies [93d9197]
  - @rethinkhealth/hl7v2-decode-escapes@0.2.5
  - @rethinkhealth/hl7v2-parser@0.2.5
  - @rethinkhealth/hl7v2-jsonify@0.2.5
  - @rethinkhealth/hl7v2-ast@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [28fef0d]
- Updated dependencies [b4b9944]
- Updated dependencies [28fef0d]
  - @rethinkhealth/hl7v2-ast@0.2.4
  - @rethinkhealth/hl7v2-parser@0.2.4
  - @rethinkhealth/hl7v2-jsonify@0.2.4

## 0.2.3

### Patch Changes

- 6c779c3: Fix missing first components in multicomponent fields

  Fixed a critical bug where the first component of multicomponent HL7v2 fields was being dropped from the JSON output. The issue occurred in the jsonify package's index conversion logic:
  - **Problem**: Components with 0-based indices were incorrectly converted to -1-based indices, causing `array[-1] = value` assignments that don't create valid array elements
  - **Root cause**: The conversion logic `n.index - 1` was applied to all node types, but should only apply to fields (to skip the segment header at index 0)
  - **Solution**: Components and subcomponents now preserve their original 0-based indices, while fields continue to have their indices converted for proper array positioning

  **Examples of fields that are now fixed:**
  - `ORU^R01` now correctly parses to `["ORU", "R01"]` instead of `["R01"]`
  - `PATID1234^5^M11` now correctly parses to `["PATID1234", "5", "M11"]` instead of `["5", "M11"]`

  Added comprehensive test coverage to prevent regression of this issue.

- Updated dependencies [6c779c3]
  - @rethinkhealth/hl7v2-jsonify@0.2.3
  - @rethinkhealth/hl7v2-parser@0.2.3
  - @rethinkhealth/hl7v2-ast@0.2.3

## 0.2.2

### Patch Changes

- 34c02e9: Improve documentation and clarify usage instructions in README.md
  - @rethinkhealth/hl7v2-parser@0.2.2
  - @rethinkhealth/hl7v2-jsonify@0.2.2
  - @rethinkhealth/hl7v2-ast@0.2.2

## 0.2.1

### Patch Changes

- dbd1b13: This PR improves the HL7v2 JSON conversion utilities and related packages. It enhances the `@rethinkhealth/hl7v2-jsonify` package to better handle edge cases, such as missing segment names, non-numeric indices, and deeply nested HL7 structures. The update also includes additional tests to ensure robust and predictable behavior. Patch releases are published for all related HL7v2 packages to reflect these improvements and maintain compatibility across the ecosystem.
- Updated dependencies [dbd1b13]
- Updated dependencies [d6d2bd6]
- Updated dependencies [a25e1c4]
  - @rethinkhealth/hl7v2-jsonify@0.2.1
  - @rethinkhealth/hl7v2-parser@0.2.1
  - @rethinkhealth/hl7v2-ast@0.2.1

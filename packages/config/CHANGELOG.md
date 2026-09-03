# @rethinkhealth/hl7v2-config

## 0.18.0

### Patch Changes

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

### Patch Changes

- Updated dependencies [514f3dc]
  - @rethinkhealth/hl7v2-utils@0.5.0

## 0.4.2

### Patch Changes

- @rethinkhealth/hl7v2-utils@0.4.2

## 0.4.1

### Patch Changes

- 7a8ad97: - Add `defineConfig()` helper for type-safe configuration authoring with IDE autocomplete
  - Add `delimiters` configuration option to customize HL7v2 message delimiters
  - Export `HL7v2ConfigInput` type for config authoring
  - Default delimiters are now always populated in settings (no longer undefined)
- 7a8ad97: Minor bug fixes
  - @rethinkhealth/hl7v2-utils@0.4.1

## 0.4.0

### Patch Changes

- 5c1aa60: Implemented the `@rethinkhealth/hl7v2-config` package that extends unified-args configuration with hl7v2-specific settings.

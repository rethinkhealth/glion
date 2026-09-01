# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project Overview

TypeScript monorepo for HL7v2 message processing built on the `unified` framework. Parses, transforms, validates, and serializes HL7v2 messages via Abstract Syntax Trees (ASTs). Modular ecosystem of packages: core processors, plugins, lint rules, runtime clients/servers.

**Core architectural principle**: HL7v2 messages are parsed into ASTs that conform to the `unist` specification, enabling composition of transformation and validation plugins through `unified`.

**Status & constraints**:

- Under active development — not recommended for production workloads.
- **ESM-only**, no CommonJS.
- **Node.js ≥ 20** (uses `AbortSignal.any` and other Node 20 primitives).
- **pnpm only** — enforced by an `only-allow` preinstall hook.
- Pre-commit hooks run linting via `lint-staged`.
- Turbo caching is enabled for `build`, `test`, and `check-types`.

## Development Commands

```bash
# Build & types
pnpm build                    # Build all packages (turbo-cached)
pnpm check-types              # Type-check without emitting

# Tests
pnpm test                     # All tests (vitest)
pnpm test:coverage            # With coverage
pnpm test:watch               # Watch mode
pnpm --filter @glion/<pkg> test [pattern]   # Single package, optional pattern

# Lint & format
pnpm lint                     # Check via Ultracite (Oxlint + Oxfmt)
pnpm format                   # Auto-fix
pnpm dlx ultracite fix        # Same as `pnpm format`

# Benchmarks (see benchmarks/README.md before adding or renaming any)
pnpm bench                    # CodSpeed regression suite (benchmarks/suites/)
pnpm --filter @glion/benchmarks bench:lab   # Local-only workload sweeps (benchmarks/lab/)
pnpm --filter @glion/benchmarks test        # Canaries proving suites measure real work

# Dependencies
pnpm install                  # Install all
pnpm syncpack                 # Check version alignment across packages
pnpm syncpack:fix             # Auto-fix mismatches

# Releases
pnpm changeset                # Create a new changeset
pnpm ci:version               # Bump versions
pnpm ci:publish               # Publish to npm
```

## Architecture

### Monorepo structure

**pnpm workspace** managed by **Turborepo**. Public packages in `packages/` (published as `@glion/*`); internal tooling in `tools/` (private).

Public package families:

1. **Runtime** — `@glion/mllp`, `@glion/mllp-client`, `@glion/mllp-codec`, `@glion/ack`, `@glion/cli` (in `packages/glion/`)
2. **Core** — `@glion/hl7v2`, `@glion/parser`, `@glion/ast`, `@glion/builder`, `@glion/to-hl7v2`, `@glion/jsonify`
3. **Plugins** — `@glion/annotate-delimiters`, `@glion/annotate-profile-*`, `@glion/decode-escapes`, `@glion/encode-escapes`
4. **Linting** — `@glion/lint-*` plus `@glion/preset-lint-recommended`, `@glion/preset-lint-profile-recommended`, `@glion/preset-annotate-profile-recommended`
5. **Utilities** — `@glion/utils`, `@glion/util-query`, `@glion/util-visit`, `@glion/util-semver`, `@glion/util-timestamp`
6. **Data & config** — `@glion/profiles`, `@glion/config`

Internal tooling:

- `@glion/testing` — shared Vitest base config
- `@glion/tsconfig` — shared TSConfig (`base.json`, `library.json`)
- `@glion/check-readme` — README validator (`check:readme` turbo task)

### AST + unified pipeline

`@glion/hl7v2` exposes a pre-configured `unified` pipeline:

```typescript
unified()
  .use(hl7v2Parser) // text → AST
  .use(hl7v2AnnotateDelimiters) // capture MSH-1/MSH-2 delimiters
  .use(hl7v2DecodeEscapes) // decode escape sequences
  .use(hl7v2PresetLintRecommended) // core lint rules
  .use(hl7v2PresetLintProfileRecommended) // profile-aware lint rules
  .use(hl7v2Jsonify) // serialize to JSON
  .freeze();
```

Plugins are composable — usable independently or in custom combinations.

The AST (defined in `@glion/ast`, conforming to `unist`) has the hierarchy: **Root → Segment → Field → Component → SubComponent**, plus **Repetition** for `~`-delimited field repetitions. Position tracking and delimiter information are preserved throughout the tree.

### Plugins

Follow the `unified` plugin pattern:

- Export a default function that returns a transformer.
- Transformer receives the AST tree (and optional `file`).
- Use `visit()` from `@glion/util-visit` for tree traversal.
- Mutate the tree in place or return a new tree.

Reference implementations: `packages/decode-escapes/`, `packages/annotate-profile-fields/`.

### Build system

Each package uses a **dual build**:

- **tsdown** — bundles ESM JavaScript (Rolldown-based, `format: "esm"`, target `es2022`).
- **tsc** — generates TypeScript declarations with source maps for IDE go-to-definition.

`@glion/profiles` uses tsdown's `codeSplitting` to merge ~10,800 profile files into ~170 chunks for install/runtime performance.

Each package's `package.json`:

```json
{
  "type": "module",
  "types": "./dist/index.d.ts",
  "exports": { ".": "./dist/index.js" }
}
```

### Workspace dependencies

Internal dependencies use the `workspace:*` protocol; changesets resolves these to versions before publish.

## Design Philosophy

These principles are how engineering decisions get made on this codebase. They override "looks reasonable" — when in doubt, prefer the principle.

### 1. Don't over-engineer abstractions

If a helper is used once, inline it. If it just takes the class's state as a parameter bag, it's adding nothing — fold it back. Custom wrappers around platform primitives (a `Deadline` class around `AbortSignal`, an `ignoreErrors` helper around `.catch(noop)`) are usually wrong. Three similar lines is better than a premature abstraction.

**Anti-patterns from real work**:

- A `runExchange()` function whose signature mirrors `this.#host`, `this.#port`, `this.#timeout`, etc. — it's wrapping, not abstracting.
- Defensive plumbing for failure modes that don't happen (e.g. a `releaseLockSafely` + `warnReleaseLockOnce` + module latch combo for a method that never throws).
- A `Deadline` class that wraps `AbortSignal.timeout(ms)` to add nothing except a per-send disposable.

### 2. No silent error swallowing

Generic `ignoreErrors`-style helpers and bare `catch {}` are code smells — they make every suppression look identical even when reasons differ wildly, and they normalise the idea that errors are usually fine to ignore. Each suppression must be local, motivated, and explained inline. If you can't justify why this specific error type at this specific site is non-actionable, don't catch.

**Default**: let errors propagate. Tests will catch unhandled rejections; CI will catch regressions; bugs become loud, not silent.

### 3. Errors belong at the layer that owns them

Each layer handles its own concerns. Adapters absorb their own teardown errors and idempotency quirks. Core trusts adapter contracts. Don't write defensive `try/catch` in a core module to guard against a bug in the runtime adapter — document the contract loudly in the JSDoc and let adapter-level tests enforce it.

**Example**: `MllpDuplexStream.close()` MUST resolve (never reject) and MUST be idempotent. The core awaits `duplex.close()` in `finally` blocks and fires-and-forgets via `void duplex.close()` from the abort handler; the Node/Deno/Workers adapters take responsibility for honouring the contract internally.

### 4. Functional over class for internal types

Closures + factory functions for internal state. Reserve classes for the public API surface (e.g. `MllpClient`) where consumers need `instanceof` or constructor semantics. An internal "response wrapper" or "exchange handle" is almost always cleaner as a factory + plain object with closures.

### 5. Standard, mainstream patterns over custom shapes

When designing public APIs, look at how MongoDB / `fetch` / AWS SDK / Mongoose / popular Node clients solve the same problem **first**. Custom shapes (dual-interface return values, novel consumption rules) need a strong justification — they cost discoverability and tooling support, even if they're cleaner on paper.

**Specific instance**: `client.send(msg)` returns `Promise<T>` and `client.stream(msg)` returns `AsyncIterable<T>` — two methods on the client, real types — over a single dual-shape return that's both `PromiseLike` and `AsyncIterable`. The two-method shape is what mainstream clients do.

### 6. Real types beat thenable lookalikes

Return real `Promise<T>` not `PromiseLike<T>` when possible. Tooling (Sentry, OpenTelemetry, distributed tracers) does `instanceof Promise` checks — `PromiseLike` fails them silently. If you need to attach extra methods to a Promise, that's usually a sign you should be returning a separate sibling method instead.

### 7. Names should reflect domain, not implementation

API names are part of the contract. They should describe what the caller is asking for, not how we implement it.

- ✅ `mode: "OnApplication" | "OnCommit"` — mirrors HL7v2 §2.9.2 acknowledgment levels.
- ❌ `waitFor: "final" | "commit"` — leaks "we read frames in a loop."
- ✅ `MllpClientResponse`, `MllpClientError` — namespaced, domain-aligned.
- ❌ `Exchange`, `Result`, `Wrapper` — generic, internal-leaking.

A reader who doesn't know the internals shouldn't have to learn them to use the API.

### 8. No `console.*` in libraries

Libraries throw, return, or invoke caller-supplied callbacks. They don't write to stdout/stderr. This rule is absolute — not "remove before committing." If a one-time warning seems necessary, the design is probably wrong; surface it through a typed error or expose a callback option for the caller to wire.

### 9. Documentation contracts over runtime defense

When a contract is "MUST NOT throw" or "MUST be idempotent," write that loudly in the JSDoc and trust it. Defensive `try/catch`es against contract violations hide the bugs you actually want to find. Tests at the right layer enforce contracts; the consumer doesn't have to.

### 10. Comments don't fix bad design

If a chunk of code needs a long comment explaining why it's shaped this way, the design is probably wrong — refactor instead. Default to no comments. Save comments for the non-obvious WHY: a subtle invariant, a deliberate trade-off, a workaround for a specific platform bug, a reference to a spec section.

Don't explain WHAT the code does — well-named identifiers do that. Don't reference the current task or PR ("added for the X flow") — that belongs in the PR description.

### 11. Honest probability assessments over hedged generalities

When considering a defensive measure, give actual numbers. "Zero with current adapters; low for custom adapters, mitigated by adapter-level testing" beats "could happen." Calibrated risk is how the project decides what to defend against and what to leave bare.

### 12. Iterate to find the right design

Multiple proposal-and-pushback rounds are fine and expected. Reject your own first proposal when a better one surfaces. Don't default to the most defensive option just to feel safe — defaulting to defense is how `ignoreErrors` and `releaseLockSafely` are born. The design is "done" when the simplest version that handles the real failure modes is on the page, not when every conceivable failure has a guard.

## Code Style

The project uses **Ultracite** (Oxlint + Oxfmt). Most issues are auto-fixable with `pnpm format`. The pre-commit hook runs `lint-staged` to enforce formatting before commits.

Beyond what the linter catches, write code that is **type-safe, explicit, and direct**.

### Type safety & explicitness

- No TypeScript enums — use const objects or union types.
- No `any` — use `unknown` when the type is genuinely unknown, and narrow at the boundary.
- Use `as const` for literal types instead of type annotations.
- Export types with `export type`; import them with `import type`.
- Avoid non-null assertions (`!`) unless absolutely necessary; prefer narrowing.
- Use explicit parameter and return types when they enhance clarity.
- Extract magic numbers into named constants.

### Modern JS/TS

- Use arrow functions for callbacks and short functions.
- `for...of` over `.forEach()` and indexed `for`.
- Optional chaining (`?.`) and nullish coalescing (`??`) for safe property access.
- Template literals over string concatenation.
- Destructuring for object/array assignments.
- `const` by default, `let` only when reassignment is needed, never `var`.
- No namespace imports — use specific imports.
- No barrel re-exports except at public package surfaces.

### Async & promises

- `await` every promise — no floating promises.
- `async/await` over `.then()` chains.
- Don't use async functions as Promise executors.
- Handle errors meaningfully — don't catch just to rethrow.

### Error handling

- Throw `Error` objects with descriptive messages, not strings.
- No `console.log` / `debugger` / `alert` in any code path. (See Design Philosophy §8.)
- Prefer early returns over nested error-case conditionals.

### Code organization

- Keep functions focused; cap cognitive complexity.
- Extract complex conditions into well-named boolean variables.
- Group related code; separate concerns.

### Security

- Validate and sanitize user input at system boundaries.
- No `eval()` or direct `document.cookie` writes.
- `rel="noopener"` for `target="_blank"` links.
- Avoid `dangerouslySetInnerHTML`.

### Performance

- No spread syntax in accumulators within loops.
- Top-level regex literals, not constructed in hot paths.
- Specific imports over namespace imports.

## Testing

- **Vitest**, base config in `tools/testing/src/vitest.config.ts` (`@glion/testing`).
- Test files: `**/*.test.ts`, `**/*.test.tsx`.
- Each package has its own `vitest.config.ts` for package-specific settings.
- Coverage reporters: text, html, json.
- `expect()` inside `it()` / `test()` blocks.
- No `.only` / `.skip` in committed tests.
- `async/await` over done callbacks.
- Test contracts at the layer that owns them — adapter behaviour at the adapter level, core behaviour at the core level.

## Benchmarks

All benchmarks live in the `benchmarks/` workspace — never add a `bench/` directory to a package. `benchmarks/README.md` is the contract: regression suites in `suites/` (CodSpeed-tracked; bench names and fixtures are API), deep sweeps in `lab/`, assertion-shaped checks go in the owning package's `tests/`, and every suite needs a canary in `canary.test.ts`.

## Adding a new package

1. Create `packages/<new-package-name>/`.
2. `package.json` — use `workspace:*` for internal deps; include scripts `build`, `check-types`, `test`, `test:watch`.
3. `tsconfig.json` — extend `@glion/tsconfig/library.json`.
4. `tsdown.config.ts` — for the bundle build.
5. `vitest.config.ts` — for tests.
6. `README.md` — required (`check:readme` task validates).

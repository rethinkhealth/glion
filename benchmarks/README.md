# @glion/benchmarks

The single benchmark home for the glion monorepo. Per-package `bench/` directories do not exist by design — one home means the regression suite and its fixtures cannot drift.

## The four jobs

Performance work here takes one of four shapes, and each has its own place. Mixing them is how benchmarks rot.

| Job                                                                                                 | Where                                | Runs                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| **Regression tracking** — did this PR make a tracked operation slower?                              | `suites/`                            | CI, every PR, via [CodSpeed](https://codspeed.io) |
| **Laboratory** — deep workload sweeps used while optimizing                                         | `lab/`                               | Locally, on demand (`pnpm bench:lab`)             |
| **Invariant guards** — amortised-complexity claims (e.g. the codec stays O(N) under trickled input) | `suites/`, as same-bytes ratio pairs | CI, read as a ratio                               |
| **Behavioral contracts** — assertions about caching, identity, idempotency                          | The owning package's `tests/`        | `pnpm test`                                       |

A bench that calls `expect()` is a test in disguise: move it to the owning package's `tests/`, where failure is loud and attributable. A sweep with a dozen chunk shapes is lab material: keep ~4 curated cases in `suites/` and the grid in `lab/`.

## Rules for `suites/`

- **Measure the shipped artifact.** Import `@glion/<pkg>` (built `dist`), never a `../src` path. Benching unbundled sources measures a different program from the one users run.
- **Bench names are API.** CodSpeed keys history on the bench title — renaming orphans it, and changing a fixture under an unchanged title silently shifts what the number means. Treat both like breaking changes. Naming convention: `<area>: <operation> (<fixture/shape>)`.
- **The measured body contains only the operation under test.** Setup is hoisted to module or describe scope. When a per-iteration cost is unavoidable (mutating plugins need a fresh `structuredClone`), add an explicit `baseline` bench measuring that cost alone so it can be subtracted.
- **Deterministic and CPU-bound only.** No `Math.random()` in fixtures, no assertions, no mutation of shared singletons outside a bench that owns it (cold-cache benches live in their own trailing `describe`), and nothing that crosses the kernel — CodSpeed's instruction counting cannot meaningfully measure TCP round-trips, so socket-level throughput is out of scope here.
- **Fixtures: HL7v2 text is the canonical form.** Named messages live as `.hl7` files in `fixtures/messages/` (loaded via `hl7File()`, newlines normalized to CR); scale comes from composing per-index line builders with `repeat()` — `hl7(BASE, ...repeat(obxLine, 50))`. Tree suites derive their input with `parseHL7v2`, exactly as production pipelines do; nothing hand-builds ASTs. A fixture moves into `fixtures/` once two suites (or a suite and the canary) need it; single-suite shapes stay local with a comment. Profile-aware fixtures pin HL7 v2.5 — keep them on one version or cross-rule numbers stop being comparable.
- **Every suite has a canary.** `canary.test.ts` asserts each suite's processor/fixture pairing produces observable work. This exists because a profile-aware plugin silently bails when `hl7v2AnnotateProfileContext` (or the `VFile`) is missing — which once turned eight bench files into plausible-looking measurements of an early return. If you add a suite, add a canary.

## Running

```bash
pnpm bench                              # from the repo root: turbo builds deps, runs suites/
pnpm --filter @glion/benchmarks bench   # same, without the turbo wrapper
pnpm --filter @glion/benchmarks bench <pattern>   # one suite or bench by name
pnpm --filter @glion/benchmarks bench:lab         # the lab sweeps (wall time, no CodSpeed)
pnpm --filter @glion/benchmarks test              # the canaries
```

CI runs `pnpm bench:ci` under CodSpeed simulation mode (`.github/workflows/benchmarks.yml`), which counts instructions rather than wall time. That makes per-PR diffs deterministic, but also blind to allocation/GC pressure — when a dashboard "win" smells like an instructions-for-garbage trade, check it against a wall-time lab run.

Local numbers and CI numbers are different instruments; compare local against local, and let the dashboard compare PR against main.

## Coverage

| Area                                                                      | Suite                                                      | Notes                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@glion/parser`                                                           | `suites/parser.bench.ts`                                   | text → AST                                                                   |
| `@glion/hl7v2`                                                            | `suites/pipeline.bench.ts`                                 | full pipeline, the headline numbers                                          |
| `@glion/util-query`                                                       | `suites/query.bench.ts`                                    | path parsing + traversal                                                     |
| `@glion/preset-lint-profile-recommended` (+ the 5 profile lint rules)     | `suites/lint-profile.bench.ts`                             | rules measured through the preset; includes cold-cache describe              |
| `@glion/annotate-profile-*`, `@glion/preset-annotate-profile-recommended` | `suites/annotate-profile.bench.ts`                         | processors include the context plugin; clone baseline included               |
| `@glion/mllp-codec`                                                       | `suites/codec.bench.ts` + `lab/codec-chunk-sweep.bench.ts` | trickle ratio pair is the O(N) guard                                         |
| `@glion/mllp`                                                             | `suites/mllp-handle.bench.ts`                              | routing/middleware via `handle()`, no TCP                                    |
| `@glion/mllp-client`                                                      | `suites/mllp-client.bench.ts`                              | `send()` round-trip over the in-memory wire (`fixtures/memory-wire.ts`)      |
| `@glion/profiles`                                                         | `lab/profiles-cache.bench.ts`                              | cache-layer comparison; cold/warm regression signal comes via the lint suite |

Deliberately unbenchmarked: pure-vocabulary and config packages (`@glion/ack`, `@glion/ast`, `@glion/config`, `@glion/utils`, semver/timestamp/uid utils — no hot path) and the individual escape/delimiter plugins (covered inside the pipeline suite). If one of these grows a hot path, it earns a suite — absence should be a decision, not an accident.

## PR norms

- A PR claiming a performance improvement links its CodSpeed comparison.
- A PR optimizing an untracked path adds the bench **first** (so the baseline lands in its own commit), then the optimization.
- A bench enters `suites/` only if a regression in it would change a decision; everything else is lab. Every suite bench is CI time and dashboard surface forever.
- New and renamed benches show up on the dashboard as fresh baselines ("new benchmark"), not comparisons — expect that on the first PR after adding one.

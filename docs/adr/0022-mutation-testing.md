# ADR 0022: Mutation Testing as the Test-Strength Gate

## Status

Accepted (implemented in PR #764, issue #737)

## Context

Coverage answers whether a line executed. It does not answer whether a test would notice if that line were wrong. For tests written by agents this gap is the whole problem: LLM-written tests are boundary-blind (they assert far from the edge a relational mutant moves) and tend to assert what the model expects rather than what the code does. A 2026 replication study found that coverage and mutation score predict fault detection only in regression settings where the code under test is assumed correct, which is the setting of almost every glion PR. So the metrics are usable here, but only if a test-strength signal sits behind the coverage number.

Until this decision glion had no such signal. The patch-coverage gate (PR #749) requires new lines to run; nothing required that the tests asserting on them could fail.

The roadmap (issue #747) puts mutation testing first in Phase 1 because the agent verify loop (#739), the mllp-client depth work (#740), and the semantic-mutant experiment (#745) all consume its output.

## Decision

### 1. StrykerJS, shared configuration, one line per package

Mutation testing runs with StrykerJS 10 and its vitest runner. The configuration lives once, in `@glion/testing/stryker`, as `strykerConfig({ break })`: the package's own `vitest.config.ts`, `perTest` coverage analysis, `ignoreStatic`, `incremental` state under `reports/` (git-ignored), and a JSON report for tooling. Each package that opts in carries a two-line `stryker.config.mjs` that calls it with its own `break`. This mirrors how every `vitest.config.ts` merges `baseConfig` from the same package.

What cannot be shared is the dependency: each opted-in package lists `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` as devDependencies. Stryker resolves its plugins from the package that runs it, and under pnpm's isolated store nothing installed at the root is visible there. syncpack keeps the versions aligned.

### 2. Scope: pure, protocol-critical packages first

Six packages opt in: `parser`, `to-hl7v2`, `mllp-codec`, `encode-escapes`, `decode-escapes`, `util-query`. They are pure, fast, and where a silent wrong branch costs the most. `mllp-client` and `mllp` follow once these hold. `glion` (the CLI) spawns processes and is measured before it opts in.

### 3. Thresholds: measured baseline minus five, only ever raised

Each package's `break` is its measured baseline score minus five points, rounded down. The gate holds on day one and is raised as survivors are triaged. It is never lowered; a PR that needs a lower `break` is a PR that removed a test.

| Package          | Baseline (2026-09-13) | `break` |
| ---------------- | --------------------- | ------- |
| `encode-escapes` | 84.75%                | 79      |
| `decode-escapes` | 89.13%                | 84      |
| `to-hl7v2`       | 91.43%                | 86      |
| `mllp-codec`     | 79.53%                | 74      |
| `parser`         | 80.27%                | 75      |
| `util-query`     | 85.78%                | 80      |

### 4. Granularity: changed packages, not changed files

`pnpm mutate:changed` runs every opted-in package that turbo sees as changed since `origin/main`. `pnpm mutate` runs them all. There is no per-file scoping: Stryker 10 has no `--since` flag, and with every package finishing in under 30 seconds alone (about 10 seconds for all six through turbo), the complexity would buy nothing.

### 5. CI: on every PR, weekly in full, not yet required

`.github/workflows/mutation.yml` runs `mutate:changed` on pull requests and the full set weekly and on demand, writes a per-package score table to the job summary, and uploads the JSON reports. The job is not a required status check until it has run green across several PRs; then it joins the ruleset with the other gates.

### 6. Survivors are triaged, never accepted silently

A surviving mutant gets exactly one of two responses:

- a test whose name states the HL7v2 or MLLP contract the mutant violates, or
- a `// Stryker disable next-line <Mutator>: <reason>` when the mutant is equivalent.

A test named after a mutant is rejected in review. The reason on a disable names the equivalence, not the rule. This is the same rule the complexity cap uses (PR #752).

## Consequences

### Positive

1. Test strength becomes a number per package, with a floor that can only rise.
2. Agents get an adversarial sensor they can act on alone: a survivor is a concrete, reproducible "your tests would not catch this".
3. The 196 survivors and 66 uncovered mutants across the six packages are a ranked worklist for depth work, replacing guesswork about where the next test should go.

### Negative

1. One more CI job per PR, about five minutes including install and build.
2. Equivalent mutants need human judgement. The disable comment makes each one visible and reasoned, but it is still a judgement.
3. Scores can be gamed by tests written to kill mutants rather than to state contracts. The naming rule is the mitigation; review enforces it.

### Neutral

1. The mutation score is a regression guard, not a correctness proof. In a package where the code under test is itself wrong, a high score says only that the tests agree with the code.

## Alternatives Considered

- **Coverage thresholds alone.** Rejected. This is exactly what LLM-written tests satisfy without asserting anything.
- **Per-file mutation scoping on PRs.** Rejected for now. No `--since` in Stryker 10, and package-level runs are already fast. Revisit if a package grows past a couple of minutes.
- **Root-level Stryker devDependency.** Rejected. pnpm's isolation hides root-installed plugins from Stryker's discovery; per-package devDependencies match how vitest is declared everywhere else. The configuration itself is shared; only the dependency is not.
- **Required check from day one.** Deferred. A few weeks of data first, so the thresholds are known to be stable before they can block a merge.
- **LLM-generated semantic mutants.** Not an alternative but a complement, tracked as #745; syntactic mutants are weak on protocol semantics such as acknowledgment modes and frame boundaries.

## References

- Issue #737, epic #747, PR #764
- `docs/contributing/mutation-testing.md` (how to run it and triage survivors)
- Replication study on coverage and mutation score for LLM-generated tests: https://arxiv.org/abs/2607.22880
- Stryker incremental mode: https://stryker-mutator.io/docs/stryker-js/incremental/
- Stryker disable comments: https://stryker-mutator.io/docs/stryker-js/disable-mutants/

## History

- 2026-09-13: Accepted with the implementation in PR #764.

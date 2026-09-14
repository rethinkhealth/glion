# ADR 0022: Mutation Testing as the Test-Strength Gate

## Status

Accepted. Implemented in PR #764 for issue #737.

## Context

### What coverage measures, and what it leaves out

Coverage records which lines ran while the tests executed. It says nothing about what the tests asserted. A test can execute every line of a function, assert something unrelated, and count as full coverage. Coverage therefore answers "did this code run?" and leaves "would a test notice if this code were wrong?" unanswered.

Mutation testing answers the second question. It changes the code in small, plausible ways, such as flipping a comparison or deleting a branch, runs the tests against each change, and reports which changes went undetected. An undetected change is a place where the tests would not catch a bug.

### Why the gap matters more for agent-written tests

Tests written by language models fail in two characteristic ways that coverage cannot see.

The first is boundary blindness. A model tends to test a representative valid input and a representative invalid one, far from the edge. A mutant that moves a `<` to a `<=` changes behavior only at the edge, so those tests keep passing.

The second is asserting on expectation rather than behavior. A model writes the value it expects the code to return, not the value the code returns. When the two agree the test is fine. When they disagree the test encodes the model's assumption, and the wrong code and the wrong test pass together.

Mutation testing catches both. A boundary mutant survives when no test probes the edge. An expectation-anchored test lets many mutants survive because it never exercised the real behavior.

### What the evidence says about the metric

A replication study published in July 2026 examined whether coverage and mutation score predict how many real faults a test suite detects. The answer depends on the setting. When the code under test is assumed correct, and the tests exist to catch future regressions, both metrics track fault detection well. When the code under test is itself suspected of being wrong, neither metric is reliable.

Almost every glion pull request is a regression setting. The change is reviewed, merged, and expected to hold. So the metric is meaningful here, with one condition: the coverage number needs a strength signal behind it, or it can be satisfied by tests that assert nothing.

### Where glion stood

The patch-coverage gate from PR #749 requires new lines to run. Nothing required that the tests covering them could fail. That was the missing signal.

The roadmap in issue #747 places mutation testing first in its second phase because three later items consume its output: the agent verify loop (#739), the depth work on `mllp-client` (#740), and the semantic-mutant experiment (#745).

## Decision

### 1. StrykerJS, configured once, opted into per package

Mutation testing runs with StrykerJS 10 and its vitest runner.

The configuration lives in one place, `@glion/testing/stryker`, as a function `strykerConfig({ break })`. It sets the package's own `vitest.config.ts` as the test config, per-test coverage analysis so each mutant runs only the tests that reach it, `ignoreStatic` to skip mutants that execute only at module load, incremental state under `reports/` so repeated local runs are fast, and a JSON report for tooling. This mirrors how every `vitest.config.ts` in the repo merges `baseConfig` from the same package.

A package opts in with a two-line `stryker.config.mjs` that calls the function with its own `break`.

What cannot be shared is the dependency. Each opted-in package lists `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` as devDependencies. Stryker discovers its plugins relative to the package that runs it, and pnpm's isolated store makes nothing installed at the root visible there. syncpack keeps the versions aligned across packages.

### 2. Scope: the pure, protocol-critical packages first

Six packages opt in: `parser`, `to-hl7v2`, `mllp-codec`, `encode-escapes`, `decode-escapes`, and `util-query`. They are pure functions over bytes and trees, they run fast, and a silent wrong branch in any of them corrupts data for every consumer.

`mllp-client` and `mllp` follow once these six hold. The CLI package spawns processes and is measured before it opts in.

### 3. Thresholds: baseline minus five, raised and never lowered

Each package's `break` is its measured baseline score minus five points, rounded down. The gate holds on the day it is introduced and is raised as survivors are triaged.

A `break` is never lowered. A change that needs a lower `break` is a change that removed a test.

| Package          | Baseline (2026-09-13) | `break` |
| ---------------- | --------------------- | ------- |
| `encode-escapes` | 84.75%                | 79      |
| `decode-escapes` | 89.13%                | 84      |
| `to-hl7v2`       | 91.43%                | 86      |
| `mllp-codec`     | 79.53%                | 74      |
| `parser`         | 80.27%                | 75      |
| `util-query`     | 85.78%                | 80      |

### 4. Granularity: changed packages, not changed files

`pnpm mutate:changed` runs every opted-in package that turbo sees as changed since `origin/main`. `pnpm mutate` runs all of them.

There is no per-file scoping. Stryker 10 has no flag for it, and it would buy nothing: each package finishes in under thirty seconds on its own, and all six finish in about ten seconds through turbo.

### 5. In CI on every pull request, in full weekly, not yet required

The workflow `.github/workflows/mutation.yml` runs the changed packages on every pull request and the full set weekly and on demand. It writes one table of scores to the job summary through `pnpm mutate:report` and uploads the JSON reports as an artifact.

The job is not yet a required status check. It joins the ruleset once it has run green across several pull requests and the thresholds are known to be stable.

### 6. Survivors are triaged, never accepted silently

A surviving mutant gets one of two responses.

If the mutant changes observable behavior, a test is added whose name states the HL7v2 or MLLP contract the mutant violates.

If the mutant is equivalent, meaning no input can distinguish the mutated code from the original, the line gets `// Stryker disable next-line <Mutator>: <reason>`, where the reason states the equivalence.

A test named after a mutant is rejected in review. This is the same rule the complexity cap applies to its disable comments.

## Consequences

### Positive

Test strength becomes a number per package with a floor that only rises.

Agents get an adversarial sensor they can act on alone. A survivor is a concrete, reproducible statement that the tests would not catch a particular bug, and the fix is a test, not a judgement call.

The survivors are a ranked worklist. Across the six packages the first run left 196 mutants surviving and 66 with no covering test. That replaces guesswork about where the next test belongs.

### Negative

One more CI job per pull request, around five minutes including install and build.

Equivalent mutants need human judgement. The disable comment makes each judgement visible and reasoned, but it is still a judgement.

The score can be gamed by tests written to kill mutants rather than to state contracts. The naming rule is the mitigation, and review enforces it.

### Neutral

The mutation score is a regression guard, not a proof of correctness. In a package whose code is itself wrong, a high score means only that the tests agree with the code.

## Alternatives Considered

**Coverage thresholds alone.** Rejected. Coverage is the metric that tests can satisfy without asserting anything, which is the problem this decision exists to solve.

**Per-file scoping on pull requests.** Rejected for now. Stryker 10 does not offer it, and package-level runs are already fast. Revisit if a package grows past a couple of minutes.

**A root-level Stryker dependency.** Rejected. pnpm's isolation hides root-installed plugins from Stryker's discovery. Per-package devDependencies match how vitest is declared everywhere else. The configuration is shared; only the dependency is not.

**A required check from the first day.** Deferred. A few weeks of data first, so the thresholds are known to be stable before they can block a merge.

**Language-model-generated semantic mutants.** Not an alternative but a complement, tracked as #745. Syntactic mutants are weak on protocol semantics such as acknowledgment modes and frame boundaries.

## References

- Issue #737, epic #747, PR #764
- `docs/contributing/mutation-testing.md`: how to run it and triage survivors
- Replication study on coverage and mutation score for LLM-generated tests: https://arxiv.org/abs/2607.22880
- Stryker incremental mode: https://stryker-mutator.io/docs/stryker-js/incremental/
- Stryker disable comments: https://stryker-mutator.io/docs/stryker-js/disable-mutants/

## History

- 2026-09-13: Accepted with the implementation in PR #764.

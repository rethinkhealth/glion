# ADR 0022: Mutation Testing as the Test-Strength Gate

## Status

Accepted. Implemented in PR #764 for issue #737.

## Context

### What mutation testing is

Mutation testing measures how good a test suite is at detecting faults. A tool makes one small change to the program, called a mutant: it flips a comparison operator, deletes a statement, replaces a constant, negates a condition. It then runs the tests against that mutant. If at least one test fails, the mutant is killed. If every test still passes, the mutant survives, and the suite has just been shown to be blind to that fault. The tool repeats this for every mutant it can generate and reports the mutation score: the share of mutants that were killed.

Some mutants cannot be killed because the change does not alter behavior; a `<` becomes `<=` on a value that is never equal, for instance. These are equivalent mutants. They are excluded from the score once identified, and identifying them takes judgement.

The technique dates from the 1970s. It is the standard answer to the question every other test metric dodges: not whether the tests ran the code, but whether they would fail if the code were wrong. The reason it is trusted as a proxy: on datasets of real, historical faults, a suite's ability to kill mutants correlates significantly with its ability to detect those faults, and the correlation holds after controlling for coverage.

### Why coverage is not enough

Coverage records which lines ran during the tests. It does not record what the tests asserted. A test can execute every line of a function, check nothing about the result, and still count as full coverage. The patch-coverage gate from PR #749 therefore guarantees that new code runs under test. It cannot guarantee that a bug in that code would make a test fail.

### Why it matters for glion

glion is a parser, serializer, and wire codec for HL7v2, the messaging standard that carries admissions, lab results, and medication orders between hospital systems. Its failures are silent by nature. A parser that drops a field, a serializer that emits the wrong delimiter, or a codec that accepts a truncated frame produces a well-formed but wrong message, and no consumer sees an error. The QA plan of April 2026 names silent data corruption and diagnostic integrity as the two risks that shape the whole test strategy.

The existing layers address input: conformance corpora, fuzzing, and round-trip properties prove the pipeline handles the messages it will meet. None of them measures the tests themselves. The packages where a silent wrong branch does the most damage, the parser, the serializer, the codec, and the query and escape utilities, are exactly the ones full of small decisions, off-by-one bounds, and delimiter comparisons that a single flipped operator turns into corruption. Those are the faults mutation testing is built to expose.

### The metric's limits

Mutation score is meaningful when the code under test is trusted and the tests exist to keep it that way. It says little when the code is itself suspected of being wrong, because a suite that agrees with wrong code scores well. Almost every glion pull request is the first case: a reviewed change expected to hold. That is the setting where mutation score tracks real fault detection.

### Who writes the tests

Contributions to glion come from people and from coding agents, and the gate has to hold for both. Agent-written tests have two documented weaknesses that coverage cannot see: they tend to probe inputs far from boundaries, and they tend to assert the value the model expected rather than the value the code returns. Mutation testing catches both, because a boundary mutant survives when no test reaches the edge, and an expectation-anchored test lets mutants through wholesale. This is a reason to want the gate, not the reason for it.

### Sequencing

The roadmap in issue #747 places mutation testing first in its second phase because later items consume its output: the depth work on `mllp-client` (#740) uses survivors as its worklist, the contributor verify loop (#739) runs it before review, and the semantic-mutant experiment (#745) builds on its reports.

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

Every contributor, human or agent, gets a concrete, reproducible statement of which bugs the tests would not catch, and can act on it before review.

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
- Just, Jalali, Inozemtseva, Ernst, Holmes, Fraser, "Are Mutants a Valid Substitute for Real Faults in Software Testing?", FSE 2014: https://homes.cs.washington.edu/~mernst/pubs/mutation-effectiveness-fse2014.pdf
- Replication study on coverage and mutation score for LLM-generated tests: https://arxiv.org/abs/2607.22880
- Stryker incremental mode: https://stryker-mutator.io/docs/stryker-js/incremental/
- Stryker disable comments: https://stryker-mutator.io/docs/stryker-js/disable-mutants/

## History

- 2026-09-13: Accepted with the implementation in PR #764.

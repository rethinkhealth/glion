---
title: How to run mutation testing and triage survivors
type: how-to
audience: contributor
section: community
status: stable
last_reviewed: 2026-09-13
---

# How to run mutation testing and triage survivors

This guide shows you how to run Stryker on the packages that opt in, read the result, and deal with each surviving mutant before you open a PR. It assumes the package's tests already pass. Why glion gates on mutation score is in ADR 0022.

## Run it on what you changed

From the repo root, after `pnpm test` is green:

```bash
pnpm mutate:changed
```

This runs every opted-in package that turbo sees as changed since `origin/main`. To run one package regardless:

```bash
pnpm --filter @glion/parser mutate
```

The first run in a package takes up to half a minute; later runs reuse `reports/stryker-incremental.json` and only re-test mutants in code that changed.

If you touched only root files (`package.json`, `turbo.json`, the lockfile), turbo treats every package as changed and all six run. That still finishes in about ten seconds.

## Read the result

The terminal shows each surviving mutant as a diff against your source with the tests that ran against it, then a per-file score table. The run fails when a package's score drops below the `break` value in its `stryker.config.mjs`.

```
[Survived] ConditionalExpression
src/index.ts:85:7
-     if (!value) {
+     if (false) {
Tests ran:
    hl7v2EncodeEscapes plugin encodes field delimiter
    ...
```

Read a survivor as a sentence: "the tests that cover this line would still pass if `!value` were always false". That is the gap.

For a browsable report, add the HTML reporter for one run:

```bash
pnpm --filter @glion/parser mutate -- --reporters html,clear-text
open packages/parser/reports/mutation/mutation.html
```

## Triage each survivor

Every survivor gets one of two responses. Decide which before writing anything.

**If the mutant changes observable behaviour**, write a test that fails on the mutant and passes on the original. Name it after the contract it protects, in HL7v2 or MLLP terms, never after the mutant:

```ts
// yes
it("unframe rejects a frame whose end block arrives split across chunks", ...)

// no
it("kills the ConditionalExpression mutant on line 85", ...)
```

Put it in the package's `tests/` next to the file's other tests. Re-run the package; the mutant should now be `Killed`.

**If the mutant is equivalent**, that is, no input can tell the mutated code from the original, disable it on that line with the reason:

```ts
// Stryker disable next-line EqualityOperator: <= and < agree here because length is never equal to max
if (length < max) {
```

The mutator name comes from the survivor's header (`ConditionalExpression`, `EqualityOperator`, `BlockStatement`, and so on). The reason states the equivalence, not the rule. Disabled mutants report as `Ignored` and do not count toward the score.

If you are not sure which case you have, it is the first case. Write the test; if you cannot make it fail on the mutant, you have found your equivalence argument.

## Raise the floor when you can

When a package's score is comfortably above `break` after your triage, raise the `break` in its `stryker.config.mjs` to the new score minus five. That file is two lines; everything else comes from `strykerConfig` in `@glion/testing/stryker`, so a change to the shared settings is one edit. Never lower it. A PR that needs a lower `break` is a PR that removed a test.

## Verifying

`pnpm mutate:changed` exits 0 and the score table shows no package below its `break`. On the PR, the "Mutation testing (changed packages)" job is green and its summary lists the same scores.

## See also

- ADR 0022, `docs/adr/0022-mutation-testing.md`: why this gate exists and how thresholds are set
- CONTRIBUTING, Testing section: the full list of what a change brings with it
- Stryker disable comments: https://stryker-mutator.io/docs/stryker-js/disable-mutants/
- Stryker mutator reference: https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/

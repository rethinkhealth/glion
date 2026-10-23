---
name: glion-property-tests
description: Write or audit a property-based test in the glion monorepo — a fast-check property in a package's `tests/` or in `qa/`, such as a round trip, an idempotence, or a never-throws check. Use whenever adding, editing, or reviewing one, including a property inherited from earlier work, and when a mutation survivor is answered with a property.
---

# glion-property-tests

A property is only as strong as the inputs that reach its check and the bugs that can make it fail. A property that passes on every run proves nothing until it is shown to run its check and to fail when the code is wrong. This skill is the checklist for both.

Adapted from the `add-project` skill of [theorem-labs/oss-verify](https://github.com/theorem-labs/oss-verify/blob/main/.claude/skills/add-project/SKILL.md) (Apache-2.0), which writes fuzz targets that formal proofs are stated over.

## 1. Ask what "correct" means

Ask the maintainer each question. Do not guess an answer.

1. **The contract.** What must always be true, in the maintainer's words: a round trip (`parse(serialize(tree))` is the tree), an idempotence (a second pass changes nothing), agreement between two APIs, a limit on an output. Which HL7v2 section or ADR states it?
2. **The domain.** Which inputs must the property hold for: messages a sender may write, any text, any tree the builder can make? An input outside the domain is not generated, rather than generated and skipped.
3. **Expected outcomes.** Which outcomes are correct and not a failure: a lint finding, a documented error such as `EscapeSequenceError`, an empty result? Each one is named, and asserted.

The answers go in the comment above the property. No separate document holds them.

## 2. The rules

1. **The check fails loudly.** The property ends in `expect` on the contract. Nothing after the generator decides whether `expect` runs.
2. **No caught failure counts as a pass.** Never `try { … } catch { skipped++; return; }`, and never a skip counter compared against a budget. An error the code under test throws is a failure of the property unless step 1.3 names it; then catch that one type and assert it, as the content property of `qa/tests/round-trip.test.ts` does with `EscapeSequenceError`.
3. **No counted outcome stands in for the contract.** Never assert that some runs held (`expect(heldCount).toBeGreaterThan(0)`). Every run holds, or the property is false.
4. **Stay in the domain by construction.** Generate inputs in the domain. Where a filter is unavoidable, use `fc.pre`, so fast-check fails the property when too many runs are rejected; never an early `return`.
5. **A coverage witness.** Pass `examples` to `fc.assert`, or write `it` cases next to the property, so that each branch the contract names runs at least once: each delimiter level, an empty value, the segment the bug was in. Fast-check runs `examples` before the generated inputs.
6. **A distinguishing mutant.** For each property, make a one-line change in `src/` that breaks the contract (flip a comparison, drop a delimiter, skip an escape), run the property, and confirm it fails. Undo the change. Record the change and the input fast-check shrank to in the property's comment. In a package with a `stryker.config.mjs`, a killed mutant from `pnpm mutate:changed` is the record. A property that no change can make fail checks nothing; write it again.
7. **Bounded runs.** Set `numRuns` when the default is not enough, and bound each size the generator draws (`maxLength`, `maxDepth`).
8. **Depend only on the input.** No clock, no `Math.random`, no network, no file other than a fixture. A failure reproduces from the seed fast-check prints.

## 3. Audit an inherited property

Inherited properties often break these rules, and no tool finds it: they pass `pnpm test`, coverage, and review. Read each one against section 2. Then measure it: sample its generator with `fc.sample` over a few thousand inputs and count how many runs reach the `expect`, how many throw, and how many break the contract. A property whose catch never fires or whose contract fails on a sampled input is a finding.

A sampled input that breaks the contract is a bug. It gets an issue and a regression file before the property is made strict, as CONTRIBUTING's testing section requires.

## Banned

| Pattern                                                                   | Why                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `catch { skipCount++; return; }`                                          | A crash in the code under test passes the property                          |
| `expect(skipCount).toBeLessThan(150)` with `numRuns: 300`                 | Half the runs may check nothing                                             |
| `if (equal) { heldCount++; }` then `expect(heldCount).toBeGreaterThan(0)` | One run holding passes the property; every other run may break the contract |
| `if (!inDomain) { return; }` inside the property                          | Rejected runs are invisible; use `fc.pre` or a narrower generator           |
| `catch (error) { return; }` with no assertion on `error`                  | Any error passes, not the one the contract names                            |
| A property with no recorded mutant                                        | Nothing shows it can fail                                                   |

## Shape

```ts
// A message the parser reads is written back as the same text: the
// serializer keeps every delimiter the sender wrote.
//
// Mutant: `to-hl7v2` writes the repetition separator where a component
// separator belongs. Fails on `"MSH|^~\\&|a\rPID|1^2"`.
it("a message is written back as it was read", async () => {
  await fc.assert(
    fc.asyncProperty(arbHL7v2Message, async (source) => {
      expect(String(await roundTrip.process(source))).toBe(source);
    }),
    { examples: [["MSH|^~\\&|a\rPID|1^2~3&4"]], numRuns: 300 }
  );
});
```

The mutant decides what the property can catch. The same mutant survives an idempotence property (`twice` equals `once`): it writes `~` on both passes, so the second pass changes nothing.

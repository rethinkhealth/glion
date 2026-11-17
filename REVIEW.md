# REVIEW.md

What a review of a pull request in this repository looks for. The automated review reads this file from the base branch, never from the pull request, so a change cannot edit the review that judges it.

## What the review is for

`pnpm check`, `pnpm check-types`, `pnpm test`, patch coverage and mutation testing already judge formatting, types, complexity and test strength. Do not repeat what they report. Review what they cannot see:

- **Design.** The Design Philosophy in `.claude/CLAUDE.md`, applied to the diff.
- **HL7v2 semantics.** Whether the change states what HL7v2 says, in HL7v2 terms, for every version it claims to cover.
- **Security.** Input that crosses a boundary: bytes from a socket, a file path, a flag.

## Findings

Every finding names the contract it protects (HL7v2, MLLP, or the package's API) and says why it matters, so the maintainer does not rebuild the argument from the diff. Each one carries one of four labels:

| Label        | Meaning                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| must-fix     | The change breaks a contract or an item below marked must-fix.                            |
| should-fix   | The change works but goes against a rule in this file or in CLAUDE.md.                    |
| nit          | A preference. At most three per review.                                                   |
| pre-existing | The defect was there before this change. Report it; do not ask the author to fix it here. |

A review that finds nothing says so in one line.

## Checks by trigger

Read the diff, then run only the items whose trigger matches. Each item gives the trigger, the check, and where it came from.

### Tests and checks

| Trigger in the diff                                                                                                                                                                                                                | Check                                                                                                                                                                         | Origin                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| A check is edited: a `break` in `stryker.config.mjs`, `.claude/hooks/`, `.claude/settings.json`, `REVIEW.md`, `.github/workflows/`, `oxlint.config.ts`, `.size-limit.json`, `codecov.yml`, or an `exclude` in a `vitest.config.ts` | Must-fix unless editing that check is the stated purpose of the pull request. A check loosened so that the rest of the diff passes is rejected.                               | ADR 0022                |
| A test gains `.skip`, `.only`, a `retry`, a sleep, or a longer timeout                                                                                                                                                             | Must-fix. A flaky test gets its root cause fixed, or is deleted with the reason in the pull request.                                                                          | CLAUDE.md, Testing      |
| The pull request fixes a bug                                                                                                                                                                                                       | A file in the owning package's `tests/regressions/`, named `<issue>-<symptom>.test.ts`, with the header. It asserts the contract the bug broke, not the mechanism of the fix. | CONTRIBUTING, Testing 3 |
| A new inverse pair: encode/decode, frame/unframe, parse/format, select/set                                                                                                                                                         | A fast-check round-trip property that follows the `glion-property-tests` skill.                                                                                               | CONTRIBUTING, Testing 2 |
| A `// Stryker disable` line, or a test named after a mutant                                                                                                                                                                        | The reason states why the mutant is equivalent. Ask whether a refactor would remove the mutant instead. A test named after a mutant is rejected.                              | #982                    |
| An `oxlint-disable` in `tests/`, or tests generated from a table of closures or outcome records                                                                                                                                    | Should-fix. Tests are plain `it` and `expect`, written out case by case.                                                                                                      | CLAUDE.md §1, §2        |
| `src/` of a published package changes and no `.changeset/*.md` is added                                                                                                                                                            | Must-fix. CI does not check this.                                                                                                                                             | CONTRIBUTING, Testing 7 |

### HL7v2 semantics

| Trigger in the diff                                                                                                | Check                                                                                                                                                                                                                                     | Origin                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/parser/src/` or `packages/to-hl7v2/src/`                                                                 | Parsing then writing returns the text as given, terminators and trailing field separators included. Escape handling changes only separators and control characters, and nothing is decoded twice. Positions point into the original text. | ADR 0033 to 0036; #1054, #1100, #1139                                   |
| Delimiters taken from anywhere but the tree: `file.data`, a default, a literal `\|^~\&`                            | After parsing, the MSH segment is the only source. Read it with `msh(tree)`.                                                                                                                                                              | ADR 0037, #1172                                                         |
| A version comparison (`gte(`, a branch on MSH-12) in a producer: `acknowledge()`, the builder, the client, the CLI | Rejected. What a version allows belongs to the profile data and one transform. The MSH-9 check tracked in #1112 is the only exception.                                                                                                    | #1084, #1112                                                            |
| A generic package states an HL7v2 rule or cites a section number                                                   | The rule holds in every version from v2.4 to v2.8.2, or the code is keyed to the versions where it holds. No bare section number: sections move between versions.                                                                         | The removed `escapedLength`, which applied a v2.7 rule to every version |
| Rule or annotator logic that works around wrong data in `packages/profiles/src/profiles/`                          | Rejected. The data is fixed in the generator; the finding is pinned in a test that links the generator issue.                                                                                                                             | hl7v2-profiles#158, ADR 0027                                            |
| The parser learns about `FHS`, `BHS`, or more than one message                                                     | Rejected. The parser reads one message; batches are framed above it.                                                                                                                                                                      | #934 (closed), #505                                                     |
| `spec/` or `differential/src/abstraction.ts`                                                                       | A statement formalizes the text of HL7v2 Chapter 2, never glion's tree. Both are trusted: a mistake hides a disagreement, so review them line by line.                                                                                    | `differential/README.md`                                                |

### Lint rules and messages

| Trigger in the diff                                                                                             | Check                                                                                                                                                                                 | Origin                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| A `messages` catalog entry or the message of a thrown error                                                     | One complete sentence per cause. The text holds no value, part of a value, or Segment ID read from the message; those go in `actual` and `expected`. The HL7v2 reason goes in `note`. | ADR 0026, ADR 0030, #1097 |
| A lint rule tests a fact another rule reports, or two rules share state                                         | Rejected. A rule checks its own fact; two true reports on one segment are fine.                                                                                                       | #831                      |
| `packages/glion/src/` checks whether a message is valid, or spells out a table or guard another package exports | Rejected. The CLI reports what it observed and uses the owning package's guard.                                                                                                       | #1041 (closed), #1059     |

### Design

| Trigger in the diff                                 | Check                                                                                                                                                             | Origin                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A new `catch`                                       | It names the one error it expects and says inline why that error needs no action. A lower layer's error is relayed unchanged, not re-labelled into another class. | CLAUDE.md §2, §3               |
| A new `assert*` function, or a new throw inside one | It throws only for a state that cannot happen. A closed client or a refused connection is thrown at the call site with the typed error.                           | CLAUDE.md §12                  |
| A new exported name or option                       | It names what the caller asks for in HL7v2 or MLLP terms, not how it is built. A promise is a real `Promise`.                                                     | CLAUDE.md §5 to §7             |
| An MLLP runtime adapter                             | `close()` resolves and is idempotent, and the test for that sits with the adapter, not the core.                                                                  | CLAUDE.md §3; #776, #779, #906 |

### Performance

| Trigger in the diff                                                                                       | Check                                                                                                                                              | Origin                       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| The profile loading path: loaders in `packages/annotate-profile-context/`, stores in `packages/profiles/` | A helper extracted here can cost 30% on the cold-cache benchmarks while local timing stays flat. Ask for the CodSpeed result on the pushed commit. | #752                         |
| A bench is added, renamed, or has its fixture changed in `benchmarks/suites/`                             | The name is API. The suite has a canary. The measured run is well above a few milliseconds of real work.                                           | `benchmarks/README.md`, #892 |

### Repository

| Trigger in the diff                                               | Check                                                                                 | Origin                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| A relative import, export, or `vi.mock` specifier ending in `.js` | Should-fix. Only a runtime path naming a build artifact keeps `.js`.                  | #681                              |
| `overrides` in `pnpm-workspace.yaml` or a `package.json`          | Rejected. Bump the parent or update within its range.                                 | Maintainer decision, October 2026 |
| `packages/*/README.md`                                            | Only what a user of the package needs. No generators, ADRs, build, or test internals. | `glion-readme` skill              |
| A `/** */` block                                                  | The contract only. No rationale, history, or comparison with an alternative.          | `glion-tsdoc` skill               |

## Changing this file

An item earns its place with a trigger a reviewer can read from a diff, a check, and the pull request, issue or ADR it came from. Add one when the same miss has reached review twice. Remove one when a gate now enforces it or its origin no longer applies.

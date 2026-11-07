# What Resonate's Lean specification changes in the plan

Resonate (durable promises and durable execution) keeps a Lean 4 specification of its server protocol and holds its real servers to it in CI. It is the closest precedent to what glion is attempting: a formal specification of a wire protocol, written next to several implementations, with a small team and no Mathlib. Reviewed at `resonatehq/resonate-specification` `6b120ad` and its graft into the monorepo at `resonatehq/resonate` `28dfd01`, `spec/`.

The short version: Resonate treats the Lean specification first as an **executable oracle with a named property catalogue**, and only second as a body of proofs. Most of its value reaches the implementations before most of its theorems are proved. glion's plan had that order reversed. This review changes the order of work and answers both open decisions in [the October reassessment](./2026-10-12-lean-reassessment.md).

## What Resonate built

| Part                          | Where                               | What it is                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The protocol surface          | `spec/01-protocol`                  | Records, requests, responses, validation                                                                                                                                                                          |
| The abstract machine          | `spec/02-abstract`                  | A state, one transition per request, plus the steps the server takes on its own (timeouts, callbacks). Executable                                                                                                 |
| The property catalogue        | `spec/02-abstract/properties.lean`  | 92 named properties, each a **decidable `Bool` predicate** on one state (`.state`) or on two consecutive states (`.trans`). Named by a fixed scheme: `well_formed_…`, `consistent_…`, `preserved_…`, `monotone_…` |
| Theorems and harnesses        | `spec/04-theorems`                  | Proofs, bounded sweeps run by kernel `decide` at build time, and checks that the checks are not vacuous                                                                                                           |
| A trace checker               | `valid/lean`, `lake exe checktrace` | Reads a recorded run in the server's own wire format (NDJSON of request and response) and answers ADMISSIBLE, REFUTED (with the event number) or INCONCLUSIVE                                                     |
| A second, independent checker | `valid/porc`                        | A Go port of the machine wired into Porcupine's linearizability search                                                                                                                                            |
| A TLA+ model                  | `tlap/`                             | The same alphabet with atomicity removed, for concurrent interleavings                                                                                                                                            |
| Traffic generators            | `work/`                             | Drive real servers and record traces                                                                                                                                                                              |

The specification and the checkers are separate Lake libraries. `valid/` imports the machine and changes nothing in it: "one is the artifact and the other is a consumer."

**Status, as its README states it:** every catalogue entry holds over 1,464 enumerated scripts by `decide`; 31 of the 92 are proved for every run; the theorem that collects them, `valid_implies_legal`, is stated with `sorry` and left open, and the build names it on every run.

**How the servers use it.** The specification was a separate repository and is now grafted into the monorepo at `spec/`, beside the Rust, Postgres and Zig servers and five SDKs. The Rust server's CI records a concurrent history against a live server on each of five storage backends and runs the specification's Porcupine checker over it, unmodified. The Zig server runs the same checker on traces from its deterministic simulator. Implementations cite catalogue names in their own code (`consistent_task_iff_targeted_promise` in the Rust types, `well_formed_promise_pending_has_no_value` in the Postgres server), and the catalogue promises that a name means the same thing "in Lean, Go, TypeScript and Verus."

## How it tests itself

This is the most transferable part. Passing is treated as the weakest of several checks.

1. **Holds on the corpus.** `stage1_sweep` and `stage1_battery`: nothing in the 1,464 enumerated scripts or the hand-built battery violates the catalogue. `bounded.lean` proves that this sweep _is_ `valid_implies_legal` with both quantifiers made finite, so the sweep is a bounded instance of the theorem rather than a suggestive check.
2. **Every property can fail.** `stage1_all_falsifiable`: each entry rejects a hand-built violator, because "a predicate typo'd into a tautology passes (1) forever."
3. **The corpus reaches what each property guards.** `reaches_settled_promise`, `reaches_callbacks` and 17 more, each by `decide`. This found five dead guards: the enumerated alphabet registered no listener, created no internal promise and never held two tasks.
4. **The theorem is not vacuous.** `vacuity.lean` shows the hypothesis of `valid_implies_legal` is satisfiable by a run that reaches interesting states, and that its conclusion is falsifiable.
5. **Two independent checkers agree.** A fuzzer generates traces, runs both checkers and requires the same verdict. Generated traces need no oracle: a script of requests _is_ an execution, so a checker that refutes it is wrong; one corrupted response per trace gives the other direction, and both must refuse.
6. **Gaps are measured, not guessed.** The Porcupine README tabulates which handlers, status codes and rules recorded traffic ever exercised (7 of 10 handlers, status 200 only, one rule), and the fuzzer reports when the Lean checker declined (60% of jumpy traces), because "a decline agrees with anything."

It is also candid about what agreement does not buy: both checkers were written by the same author from the same specification, so a common misreading would agree with itself, and two read disciplines that share 99% of their code can only catch bugs in the 1% that differs.

## Where glion's plan differs, and what changes

### 1. Make the specification an oracle before making it a proof

The reassessment ordered the work as definitions, then specification theorems, then a priority semantics, and only at step 4 an executable model compared with glion. Resonate shows the reverse order pays earlier: the machine and the catalogue were usable against real servers while 61 of 92 entries were still unproved.

**Updated position:** each layer ships as (a) executable definitions, (b) a named property catalogue of decidable predicates, (c) a checker executable, and (d) bounded `decide` sweeps, before its headline proofs. Proofs then promote catalogue entries from "holds on the sweep" to "holds always," one entry at a time, and the README counts them.

### 2. A checker keeps the specification free of glion

The September comparison against glion's parser was removed to keep glion out of the specification, which left the specification with no way to judge glion at all. Resonate's split solves this: the specification library knows nothing of any implementation; a sibling library imports it and reads observations in the protocol's own format.

For HL7v2 the protocol's own format is the message text, so the checker needs nothing from glion:

- **Encoding.** Given an input text and the text an implementation wrote back after reading it, the checker answers whether both are encodings of the same well-formed message under the specification's `encode`. It runs only the sender's rule (§2.6.1), with `decode` as a search for the witness and `encode` as the verdict, so the specification still contains no parser. This check would have reported both September round-trip bugs and #933.
- **Message structure.** Given an event schema, a list of segment IDs and an implementation's grouping, the checker answers whether the grouping is one the schema admits (and, separately, whether it is the first reading). The schema's input format is the bundled event-schema JSON, as Resonate reads its server's NDJSON rather than inventing a format.

The checker is a consumer of the specification, not part of it, which is the rule the user set in September.

### 3. Properties as decidable predicates, named once

`Message.WF` and its parts are `Prop` structures today. Resonate's catalogue entries are `Bool` functions, so the same function is run by kernel `decide`, by the checker and, transcribed, by other languages. **Updated position:** state well-formedness and the layer-2 properties as `Bool` predicates (or `Prop`s with `Decidable` instances that reduce in the kernel), give them catalogue names, and let glion's lint rules and tests cite those names. A lint rule that checks "every `R` field is valued" would then name the specification entry it implements.

### 4. Check the checks

The current POC proves one necessity result (`ambiguous_without_distinct_delimiters`) and nothing about its own coverage. **Updated position:** add the falsifiability, reach and vacuity checks above to every layer, by `decide`:

- every `WF` clause and every catalogue entry rejects a hand-built violator;
- the enumerated corpus reaches each guarded case (a repetition, an empty component, a Z-segment, a repeating group, a choice);
- `decode_encode`'s hypothesis is satisfiable by a message that uses every delimiter level.

### 5. The second implementation is already there for layer 2

Resonate wrote the Go port to get a search written by someone else. glion already has one for message structure: `referenceMatch` in `scripts/check-bundle.mjs`, a backtracking parser independent of the Pike VM. **Updated position:** layer 2's checker joins `check:bundle` as a third party, and the three (Lean definitions, `referenceMatch`, the runner) must agree on generated messages, with structured generation (a valid backbone per schema, then perturbations) and corrupted cases that all three must refuse. Report the declined and vacuous comparisons, as Resonate's fuzzer does.

### 6. State open theorems in the build

Resonate states `valid_implies_legal` with `sorry` so the build names it on every run, and its README counts proved against stated. glion's README lists only what is proved. **Updated position:** state the layer-2 headline theorems (`first_reading_unique`, the runner's refinement) early, as `sorry`, beside the sweeps that back them, and keep the count in the README.

### What does not transfer

- **The TLA+ model.** It exists because Resonate's servers interleave concurrent requests over shared state. HL7v2 encoding and message structure are functions of one message; there is nothing to interleave. MLLP exchange ordering could need it one day; nothing in the current plan does.
- **Linearizability.** Same reason.
- **Numbered directories.** Resonate uses `01-protocol`, `02-abstract`, `04-theorems`. glion chose the Cedar layout (`Spec/`, `Thm/`); the review finds no reason to change it. The one structural addition is a sibling `Valid` library for the checker.

## The two open decisions, answered

**Decision 1: make message structure the next layer?** Yes, unchanged. What changes is the first deliverable: an executable layer-2 semantics, its catalogue and a checker wired into `check:bundle`, not the first proofs.

**Decision 2: priority rule as the meaning of grouping, or all groupings?** Define **all** groupings. Resonate's specification leaves the schedule of internal steps open and its checker asks whether _any_ schedule explains a trace; it states its two read disciplines as named alternatives, both inside the specification and run through the same handlers by every harness. The same shape fits HL7v2: the standard's grammar admits several groupings (`grouping_ambiguous` will show it), so the specification defines the set; the priority rule (enter before skip, repeat before leave, earlier alternative first) is stated as a named discipline in the specification; and the catalogue has two entries an implementation may claim: "the grouping is admitted" and "the grouping is the first reading." glion claims both. Another implementation that groups differently can still be judged against the first.

## Revised order of work

Replaces steps 1 to 5 of the reassessment's order of work; step 6 (layers 3 and 4 with #840) is unchanged.

1. **Encoding catalogue and checker.** Restate `WF` as decidable predicates with catalogue names; add the falsifiability, reach and vacuity checks; add a `Valid` library with a checker that reads input and output HL7v2 text. Run it over glion's parse-then-serialize on the existing fixtures and on generated messages. Expect it to report #933 and the two round-trip bugs.
2. **Layer 2 definitions, executable,** with `grouping_ambiguous`, `grouping_keeps_segments` and `empty_alternative_breaks_priority`, and bounded sweeps over small random schemas.
3. **The layer-2 checker in `check:bundle`,** in three-way agreement with `referenceMatch` and the runner on all 2,136 bundled schemas, with measured coverage and declines.
4. **State the headline theorems with `sorry`** (`first_reading_unique`; the runner returns the first reading) beside their sweeps, and count them in the README.
5. **Proofs,** one promoted entry at a time: the priority semantics and `first_reading_unique` first, then the runner, then the repair properties.

Steps 1 to 3 give glion a usable oracle before any long proof. For effort: Resonate's specification went from first commit to a 92-entry catalogue, two checkers and server CI in two months (198 commits, July to August 2026), while two thirds of its entries are still unproved. The reassessment's estimates for steps 1 and 2 stand; the long tail is the proofs, as it was for Resonate.

## Sources

- [resonatehq/resonate-specification](https://github.com/resonatehq/resonate-specification): `README.md`, `lakefile.lean`, `spec/02-abstract/properties.lean`, `spec/04-theorems/{properties-check,bounded,vacuity,holds,system,liveness}.lean`, `valid/README.md`, `valid/porc/README.md`, `tlap/README.md`.
- [resonatehq/resonate](https://github.com/resonatehq/resonate): `.github/workflows/server-core-ci.yml` (the linearizability job), `impl/server/s3/docs/validation-plan.md`.
- [Lean for HL7v2, reassessed after the event-schema engine](./2026-10-12-lean-reassessment.md); [How verification projects choose their theorems](./2026-10-01-lean-spec-theorem-methodology.md).

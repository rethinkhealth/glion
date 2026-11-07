# What large-scale LLM verification changes in our process

Anthropic's Frontier Red Team, with Theorem, reports machine-checked proofs, written by Claude, for 239 entry points in 123 open-source libraries ([LLMs are making formal software verification feasible at a much larger scale](https://www.anthropic.com/research/formal-verification), October 2026, and its six-page appendix). This review reads both for what applies to glion's HL7v2 specification, and turns that into a process and a start.

The short version: the article moves the bottleneck. Writing proofs is becoming cheap; deciding what to prove, and keeping the agent from proving something weaker, is now the expensive part. glion's process should put people on the statements and the specification, put agents on the proofs, and make the boundary between the two mechanical.

## What the work did

|                          |                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target                   | OSS-Fuzz entry points, compiled to RISC-V, under a formal semantics of RISC-V and Linux processes                                                                                                                                                     |
| Specification            | The fuzz test itself: "no input under 64 MiB makes this binary fault, abort or reach unmodeled behaviour"                                                                                                                                             |
| Theorems per entry point | Three: the sanitizer build does not crash; it behaves the same as the plain build (same reads, writes, exit and file system, for every memory layout); the plain build does not crash either                                                          |
| Prover                   | Rocq. A finished proof is about 600,000 lines in about 1,400 files (330,000 to 900,000 across libraries); about 180 million checked lines in total, out of about a billion written                                                                    |
| Trusted                  | The RISC-V and Linux semantics, the exact theorem statements, and the Rocq checker                                                                                                                                                                    |
| Bugs                     | Found while proving, then patched by the agent so the proof could continue: an underflow reachable only by ~20 MB inputs, an out-of-bounds read needing a 64 MB input, a two-handle call sequence, a libexpat CVE, and a logic bug that never crashes |
| Other studies            | zlib proved against RFC 1950 at the x86 level; a Python-subset interpreter in Rust proved against a formal semantics with Verus                                                                                                                       |

Six findings matter for glion.

1. **Tests are specifications waiting to be stated.** The specification was mechanical: "this test never fails." Fuzz tests that assert round trip, idempotence or agreement with another implementation therefore become proofs of those properties. LZO's harness asserts that decompressing a compressed buffer gives back the same length; proving the assertion never fires meant proving the round trip.
2. **Proofs beat tests on seeded bugs.** Seven bugs were injected into an early version of the Python interpreter: five survived 1.7 million random programs, and all seven broke the proof.
3. **The link to the real world was empirical.** The Python semantics was tied to CPython by running 1.7 million mostly random programs (99.95% agreement), not by proof. The binary-level work avoided that gap by reasoning about the compiled binary directly, because translating a test into Rocq "risks a translation error".
4. **Agents cheat if allowed.** "Claude could trivially make any theorem provable by rewriting a program so it never crashes." The team penalized patches, gave credit for proving which inputs a patch changes and how few, and logged and audited every patch.
5. **Agents write short specifications and long proofs.** Asked to prove two builds equivalent, agents first wrote a short specification of what the program may output (median about 110 lines, against a median program of 86 KB) and proved both builds meet it. Their proofs were verbose: registers, addresses, every branch spelled out. Experts would have introduced abstractions (calling conventions, disjoint pointers, an allocator model). The appendix cites MachCSL for agents hitting "a complexity wall with the verbose proof style".
6. **Verified is not bug-free.** The checker cannot confirm the specification matches reality. The proofs cover single-threaded static RISC-V binaries with musl, not x86 with glibc; AddressSanitizer does not catch every memory error; and callers who misuse a function are outside the proof unless each public function states what its callers must do.

Cost is the stated limit (hundreds of millions of tokens per proof; newer models used about 40% fewer on a 36-task benchmark; agents sharing a workspace used 17% fewer), with reuse of finished proofs as the main lever.

## What carries over to glion, and what does not

glion's situation differs in kind. We are not verifying compiled code; we are writing a specification of HL7v2 in Lean and holding a TypeScript implementation to it. Our proofs are about a model a few hundred lines long, so their size and cost are orders of magnitude below the article's. Three things follow.

- **Proof effort is not our bottleneck.** The reassessment estimated weeks to months for the layer-2 proofs, repair optimality hardest. Agents now write proofs of that size routinely. The bottleneck is whether the definitions match Chapter 2 and whether each statement says what we claim, which only people can check.
- **Our trust base has the same three parts as theirs.** The specification (`Spec/`) in place of the RISC-V semantics, the headline theorem statements, and the Lean kernel. Everything else, including every proof an agent writes, needs no review beyond "it builds and trusts no new axiom".
- **Our link to glion is empirical, like their Python interpreter.** There is no formal semantics of the TypeScript glion runs on, and binary-level verification of JavaScript is not on offer. So the specification reaches glion through a checker run over many generated messages, as the Resonate review proposed, and the agreement rate is the measure. That is the same bridge the Verus interpreter used to reach CPython.

Not carried over: binary-level reasoning, and rewriting glion's core in a verifiable language. The Verus interpreter shows the second is possible; for glion it would mean a second implementation of the parser or engine in Lean or Rust compiled for the browser, which costs more than it buys while the specification itself is unfinished.

## The process, changed

### 1. People own statements; agents own proofs

Split every change to `spec/` into two kinds, and review them differently:

| Kind      | Files                                                                                                       | Who writes                                              | Review                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Statement | `Spec/**`, the headline theorem files (`Thm/Encoding.lean`, later `Thm/Structure.lean`), the rule catalogue | A person, or an agent with a person approving each line | Full review with `GUIDE.md` Part 2: definitions against Chapter 2, statements in English, vacuity, falsifiability |
| Proof     | Lemma folders (`Thm/Encoding/**`, `Thm/Data/**`), `Valid/**`                                                | An agent, freely                                        | Mechanical only: the build passes, no `sorry` outside the open list, no new axiom                                 |

This is where review time pays: the article's median specification was 110 lines against proofs of 600,000. Ours will be a few hundred against a few thousand.

### 2. Make cheating visible to a machine

The article's reward hack has an exact counterpart here: an agent stuck on a proof can add a hypothesis, weaken a conclusion, or change a definition until the proof goes through. The build stays green and the claim got smaller. Three checks in CI make that impossible to miss:

- **A statement snapshot.** A small Lean program prints the full type of every headline theorem and every catalogue rule to `spec/STATEMENTS.txt`, committed. CI regenerates it and fails on any difference. A changed statement then shows up as its own diff, which the PR must explain.
- **Escape hatches.** CI fails on `sorry` outside the open list in the README, on `axiom`, `native_decide`, `implemented_by` and `unsafe`.
- **Axioms.** CI prints `#print axioms` for each headline theorem and fails if anything beyond `propext` and `Quot.sound` appears.

### 3. Turn glion's tests into specification entries

The article's main move applies directly: `qa/` already states properties as tests. Each becomes a catalogue entry or theorem, with the test's hand-written precondition replaced by a definition in the specification.

| Test today                                                                                                   | Hand-written condition          | Specification entry                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `round-trip.test.ts`: "messages without trailing empties round-trip exactly"                                 | A regex over the generated text | `decode_encode` for `Message.WF`, plus `trimFields` for presence (§2.6.2)                                                      |
| `round-trip.test.ts`: "round-trip is idempotent"                                                             | None                            | Encoding a message read from canonical text gives that text back (the canonical-text half the reassessment calls Property B)   |
| `round-trip.test.ts`: "any parseable mutated input stabilizes after one round-trip"                          | "Parseable"                     | What a receiver may read from text that is not well formed; the September bugs live here and the specification is silent today |
| `fuzz.test.ts`: "parser never throws"                                                                        | None                            | Not a specification property: totality of glion's reader. Stays a test                                                         |
| `grouped-trees.test.ts`: "serializes to the same text grouped as flat"                                       | None                            | `grouping_keeps_segments`                                                                                                      |
| `grouped-trees.test.ts`: generated messages "fit the schema they were generated from, and are grouped by it" | The generator                   | Layer 2: the schema accepts every message built from it                                                                        |

The existing idempotence tests passed while the September round-trip bugs (`PID␍|`, colliding delimiters) were present, because the generators did not produce those inputs. That is the article's point about fuzzers and rare inputs, found in our own code.

### 4. Measure confidence with seeded bugs

The article's clearest measurement was seven injected bugs, five missed by tests, none by proofs. glion can run the same experiment cheaply, because Stryker already runs on `@glion/parser`, `@glion/to-hl7v2`, `@glion/encode-escapes` and `@glion/decode-escapes`:

- Run Stryker's mutants against the package tests, as now, and against the Lean checker harness (read, write back, ask the specification).
- Report both kill rates and, more usefully, the mutants only the checker kills and the mutants neither kills. The second list is where the specification is silent.

This is the number to watch as the specification grows, and it answers "how confident should we be" with a measurement rather than an opinion.

### 5. When the checker finds a bug, characterize the fix

The article let agents patch code to keep proving, and controlled it by asking which inputs a patch changes. glion's rule for bugs is already a failing regression test first. Add one requirement: the fix states which inputs it changes, as a property over generated messages (for example: "the output differs from before only for batch files with a second header segment"). A fix that changes more than it claims is caught by the property, not by review.

### 6. Abstractions before long proofs

Agent proofs are verbose, and the article cites a project where verbosity hit a wall. For layer 2, the hard proofs (the runner returns the first reading; the repair is optimal) should start from the abstraction the published Pike VM proof used: a semantics that keeps the tree of readings with their priorities. A person sets that definition; agents prove against it. Reusable lemmas go in `Thm/Data/`, the counterpart of the article's shared proof workspace, and review asks whether a proof reuses them rather than how long it is.

### 7. Write down what is not proved

The article ends with three gaps: the model may not match the machine, the sanitizer does not catch everything, and callers are out of scope. Ours, for the README:

- **Standard gap.** The specification may not match Chapter 2. Only review closes it; each definition cites its section.
- **Model gap.** glion is checked against the specification on generated and fixture messages, not proved. The checker's agreement rate and the seeded-bug report are the evidence.
- **Caller gap.** Each public engine function has preconditions (a choice alternative matches at least one segment, ADR 0023; MSH comes first). They belong in the specification as stated assumptions, so a violation is a documented misuse rather than a surprise.

## How to get going

This merges with the five pieces from the Resonate review; piece 1 (the named rule catalogue) is done.

| Step | What                                                                                                                                             | Who                                        | Done when                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 0    | CI job for `spec/`: build, escape-hatch scan, axioms, statement snapshot                                                                         | Agent writes, person approves the workflow | A PR that weakens `encode_injective` fails CI with the statement diff                                  |
| 1    | Piece 2: a violator for each rule, reach and non-vacuity checks                                                                                  | Agent                                      | Each rule has a message it rejects; `decode_encode`'s hypothesis is met by a message using every level |
| 2    | The test-to-specification inventory above, agreed                                                                                                | Person, about an hour                      | Each `qa` property is marked: becomes an entry, stays a test, or needs a decision                      |
| 3    | Pieces 3 and 4: the checker and the harness, generating with the existing `qa/src/arbitraries.ts` and with messages encoded by the specification | Agent                                      | The harness runs in `qa` and prints an agreement rate                                                  |
| 4    | Piece 5: the confidence test                                                                                                                     | Agent runs, person reads                   | The checker reports #933 and both September round-trip bugs, and passes the clean fixtures             |
| 5    | The seeded-bug comparison on `@glion/parser` and `@glion/to-hl7v2`                                                                               | Agent                                      | Kill rates for tests and checker, and the list neither kills                                           |
| 6    | Layer 2: the reading-tree semantics, then statements, then agent proofs                                                                          | Person defines and states; agent proves    | `grouping_ambiguous`, `grouping_keeps_segments` proved; `first_reading_unique` stated                  |

Steps 0 to 5 need no new proofs, only the existing ones plus checks, and give a measured answer to how much the specification adds. Step 0 comes first because every later step is agent work, and the snapshot is what lets a person trust agent work without reading it.

## Decisions for the maintainer

1. Add a Lean CI job to the glion repository (elan, `lake build`, under ten minutes cached)?
2. Adopt the statement and proof split as a written rule in `spec/GUIDE.md` and `CONTRIBUTING.md`?
3. Accept the seeded-bug comparison as the measure of the specification's value, reported in each spec PR that changes the checker?

## Sources

- [LLMs are making formal software verification feasible at a much larger scale](https://www.anthropic.com/research/formal-verification), Anthropic, October 2026, and its appendix (October 22, 2026): what the OSS-Fuzz proofs prove; the Python interpreter in Rust; proof sizes; how the proofs look to an expert; the 36-task comparison; assertions in real entry points.
- [What Resonate's Lean specification changes in the plan](./2026-10-22-resonate-spec-review.md); [Lean for HL7v2, reassessed after the event-schema engine](./2026-10-12-lean-reassessment.md).
- glion `qa/README.md`, `qa/tests/round-trip.test.ts`, `qa/tests/fuzz.test.ts`, `qa/tests/grouped-trees.test.ts`; Stryker configurations in `packages/{parser,to-hl7v2,encode-escapes,decode-escapes}`.

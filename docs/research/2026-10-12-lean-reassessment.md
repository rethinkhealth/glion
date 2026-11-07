# Lean for HL7v2, reassessed after the event-schema engine

Main now holds a small formal language and three programs that run it. The language is the HL7v2 abstract message syntax, as event schemas. The compiler turns a schema into a Thompson automaton, the runner is a Pike VM that both validates segment order and groups segments, and the repair is a minimum-edit corrector; all three are checked against a separate backtracking reference (ADRs 0023 to 0025). That is the shape of system where machine-checked proofs have paid off elsewhere, and it moves the best target for Lean from the encoding layer to message structure. The encoding work stays valid and stays first, because it is small and nearly done. The plan below reorders what follows it.

This assessment builds on [How verification projects choose their theorems](./2026-10-01-lean-spec-theorem-methodology.md), and its theorem kinds (round trip, determinism, checker soundness, necessity, inclusion) are used by name.

## What changed on main, and what did not

| Change                                                                                                                                  | Where                                             | What it means for Lean                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Event schemas are the bundled data: `segment`, `group` and `choice` elements, each `optional` and `repeating`, one JSON file per schema | ADR 0023, `@glion/profiles`                       | The HL7v2 abstract message syntax now has a precise, machine-readable form to formalize                 |
| One compiler (Thompson NFA with group opens and closes) and one runner (Pike VM, threads in priority order) for order and groups        | ADR 0023, `engine/compile.ts`, `engine/runner.ts` | An implementation whose correctness has a known, published proof technique                              |
| Ambiguity resolved by a written priority rule: enter before skip, repeat before leave, earlier alternative first                        | ADR 0023, decision 3                              | A decision the standard does not make, stated precisely enough to prove things about                    |
| Z-segments the schema does not name fit anywhere, placed after the segment before them                                                  | ADR 0023, decision 7                              | A rule read from §2.11 and §2.6.2, with a placement choice the standard leaves open                     |
| A choice alternative must match at least one segment; otherwise the Pike VM and backtracking disagree                                   | ADR 0023, decision 6                              | A condition the engine needs, of exactly the kind a necessity theorem pins down                         |
| Segment groups in the tree, only for a message that fits                                                                                | ADR 0024, `@glion/transform-profile-groups`       | A transform that keeps the same segments in the same order: a round-trip property                       |
| Minimum-edit repair: missing and unexpected segments, each costing 1, with a tie-break order                                            | ADR 0025, `engine/repair.ts`                      | An optimization with three stated correctness properties, already tested                                |
| Profile data mirrors the printed columns: `optionality` with `R`, `RE`, `O`, `C`, `X`, `B`, `W`, and `repetitions`                      | ADR 0027                                          | Field and component definitions now match the standard's own vocabulary, which the spec can adopt as is |
| `lint-profile-withdrawn` and `lint-profile-backward-compatible`                                                                         | #917                                              | Field-level rules defined directly by the OPT codes                                                     |
| `@glion/parser`, `@glion/to-hl7v2`, `@glion/annotate-delimiters`                                                                        | unchanged since the spike                         | Earlier findings stand (see below)                                                                      |

Engine size: `compile.ts` 278 lines, `runner.ts` 348, `repair.ts` 1,091, `types.ts` 179. The independent reference, `referenceMatch` in `scripts/check-bundle.mjs`, is a memoized backtracking parser written against the schema. `pnpm check:bundle` compares the runner with it on generated messages for all 2,136 bundled schemas, and `tests/engine/random-schemas.test.ts` does the same on 3,000 random schemas. #838 (whether 18 chapter 16 and 17 groups are choices or sequences) is still open.

The parser-side findings from September are unchanged, because their code is unchanged:

- Two round-trip instabilities (a trailing segment that starts with `|`, and colliding delimiters when MSH-2 is missing).
- Batch files (FHS, BHS, then MSH) are rewritten with the wrong delimiters on parse and serialize (#933).
- Three places where the parser departs from the encoding rules: a line feed is treated as a segment terminator, a segment ID is read up to the first delimiter rather than as three characters, and a letter used as a delimiter breaks segment IDs.

## Why the engine is now the strongest target

**It is a language with a reference semantics, which is what proofs are best at.** Cedar's largest proof effort went into its symbolic compiler (sound and complete against the evaluator); CompCert's top theorem is that each compiled program behaves like its source. The event-schema engine has the same structure: a declarative meaning (which segment lists a schema accepts, and how they group), a compiler, and two algorithms over the compiled form. Each algorithm has a natural correctness theorem against the declarative meaning.

**The hardest part has been proved before, in another prover.** "Formal Verification for JavaScript Regular Expressions" gives the first formal proof of the Pike VM: it returns the top-priority match under backtracking semantics, and the backtracking semantics is proved equivalent to a line-by-line embedding of the ECMAScript standard ([arXiv 2507.13091](https://arxiv.org/abs/2507.13091); [ACM](https://dl.acm.org/doi/10.1145/3776710); the embedding is Warblre, ICFP 2024). That is glion's design decision for decision: a Pike VM whose answer is defined as the first reading a backtracking parser would find. Their technique, a semantics that keeps the whole tree of readings with their priorities rather than only the winning one, is the template to follow. No Lean version was found, so this would be the first in Lean, but the proof structure exists.

**The engine already does half of verification-guided development.** It has a reference implementation written independently of the engine, and it compares the two on every bundled schema and on random schemas. A Lean spec would replace "agree on the inputs we generated" with "agree on every input", and would turn the reference itself into something checked against the standard's grammar rather than trusted.

**It holds the decisions the standard does not make.** The standard defines the abstract message syntax but not how to group a segment list that two readings accept (89% of the ambiguous transitions found in ADR 0023 are the `ORU_R01` kind: an `ORC` after an `OBX` may start a new order or a new patient result). It does not say where a Z-segment belongs inside a group, whether a choice alternative may be empty, or how a receiver should describe a message that does not fit. glion has answered each in an ADR. Each answer can be stated as a theorem, and some can be shown necessary.

**The encoding layer, by contrast, is nearly exhausted.** Its central result, that the encoding is unambiguous, is proved. What remains (sanity facts, presence, null, escapes) is useful and small, but it will not find much more: the parser bugs it relates to were found by fuzzing in minutes.

## The specification, in four layers

The rule stays as set in September: the specification uses HL7v2's conventions only, with no parser, linter or engine in it. Each glion component is a separate model, checked against the specification.

| Layer                               | Source in the standard                                   | State                                                                     | What the spec defines                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Encoding                         | Chapter 2: §2.5, §2.6.1, §2.6.2, §2.5.3, §2.7            | Core proved (`encode_injective`, `ambiguous_without_distinct_delimiters`) | Delimiters, the message tree, the sender's encoding, presence, null, escapes                                                                   |
| 2. Message structure                | Chapter 2 abstract message syntax; §2.11 for Z-segments  | Not started; highest value now                                            | Event schemas (`segment`, `group`, `choice`, optional, repeating, `Hxx`, `anyZSegment`); which segment lists a schema accepts; their groupings |
| 3. Segment and datatype definitions | Segment attribute tables and Chapter 2A component tables | Not started                                                               | `optionality` (R, RE, O, C, X, B, W), `repetitions`, length, table, as ADR 0027 records them                                                   |
| 4. Conformance profiles             | HL7 v2 Conformance Methodology                           | Not started; tied to #840                                                 | Usage, cardinality and value sets that constrain layers 2 and 3; compliance and compatibility between profiles                                 |

Layer 2 is a regular language over segment IDs with a tree of groups on top. That keeps everything decidable, including the question layer 4 most needs: does one profile accept a subset of another's messages (language inclusion between two automata).

## Theorems for layer 2

### About the standard (implementation-free)

| Theorem                                   | Kind         | What it says                                                                                                                                           | Why it matters                                                                                                                |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `grouping_ambiguous`                      | Necessity    | For `ORU_R01` there is a segment list with two different groupings, both accepted                                                                      | Proves the standard's grammar does not determine grouping; any implementation must choose a rule, and the spec must state one |
| `first_reading_unique`                    | Determinism  | Under the priority rule (enter before skip, repeat before leave, earlier alternative first), every accepted segment list has exactly one first reading | Makes "the grouping" of a message a well-defined function, so implementations can be compared on it                           |
| `grouping_keeps_segments`                 | Round trip   | Flattening a grouping gives back the segment list, in order                                                                                            | ADR 0024's promise that grouping never drops, adds or reorders a segment                                                      |
| `empty_alternative_breaks_priority`       | Necessity    | With a choice alternative that matches nothing, two natural definitions of "first reading" disagree on some input                                      | Shows ADR 0023's contract (every alternative matches at least one segment) is required, not a precaution                      |
| `unnamed_z_segment_accepted`              | Requirement  | Inserting a Z-segment the schema does not name, anywhere, keeps the message accepted when Z-segments are allowed                                       | §2.11's allowance, stated exactly                                                                                             |
| `accepts_decidable`, `includes_decidable` | Decidability | Acceptance, and inclusion of one schema's language in another's, are decidable                                                                         | The basis for profile compliance and sender-receiver compatibility in layer 4                                                 |

`grouping_ambiguous` is the layer-2 counterpart of `ambiguous_without_distinct_delimiters`: a short, kernel-checked counterexample that turns an unstated choice into a recorded one.

### About glion's engine (implementation-side, later)

| Theorem                                                                                                             | Kind                                           | Source of the claim         |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| The runner accepts exactly the segment lists the schema accepts, and returns the first reading                      | Checker soundness and completeness; refinement | ADR 0023, decisions 2 and 3 |
| `compile` preserves the schema's language and groups                                                                | Refinement                                     | ADR 0023, decision 4        |
| `repair` returns no edits exactly when the message is accepted                                                      | Checker soundness                              | ADR 0025, decision 8        |
| Applying a repair's edits gives an accepted message                                                                 | Soundness                                      | ADR 0025, decision 8        |
| No repair with fewer edits exists                                                                                   | Optimality                                     | ADR 0025, decision 1        |
| The repair chosen among equal-cost repairs is the one the tie-break order names, and is the same for the same input | Determinism                                    | ADR 0025, decision 2        |
| The transform's groups are the runner's first reading, and keep every segment in order                              | Refinement; round trip                         | ADR 0024, decisions 1 and 3 |

ADR 0025's three tested properties are already written as theorem statements; Lean would prove them for all inputs instead of the generated ones.

## Layers 3 and 4, briefly

Layer 3 adopts ADR 0027 directly: a field or component definition is its printed columns, with `optionality` as an enumeration of the seven codes. Message-level theorems follow from the code's meaning: a conforming message values every `R` field, leaves every `W` field empty, and leaves every `X` field unused. `RE`, `B` and `C` need more: `RE` is a statement about what the sender knows (the methodology report's finding), `B` is `O` with a status, and `C` has a prose condition the base standard does not make computable. Facts about the bundled data itself, such as "a later version only appends fields to a segment" (the #916 renumbering bug broke it), are better as executable checks run by a Lean program over the data than as theorems, as `check:bundle` does in JavaScript today.

Layer 4 is where #840 lands. A conformance profile constrains layers 2 and 3 with usage, cardinality and value sets. Compliance (a constrained profile accepts fewer messages) and compatibility (everything a sender's profile allows, the receiver's accepts) become inclusion questions, decidable because layer 2 is regular. This is the closest analogue to Cedar's `verifyImplies` and JSON Schema containment, and it is where a verified result would matter most to people outside glion.

## Connecting the spec to glion

The comparison test against the TypeScript parser in September agreed on 300,000 inputs and was removed from the branch to keep the specification free of glion. The same approach applies to the engine, with less work, because the engine already has a comparison harness:

1. A Lean program reads event schemas and segment lists and prints the first reading (and, later, a repair).
2. `check:bundle` and `random-schemas.test.ts` compare `runner` and `repair` with it, beside or in place of `referenceMatch`.
3. Proofs about the engine model come after the comparison agrees, as Cedar did: model first, differential testing next, proofs last.

## Order of work

> Superseded on 2026-10-22 by [What Resonate's Lean specification changes in the plan](./2026-10-22-resonate-spec-review.md): each layer ships as an executable catalogue and a checker before its proofs, and steps 1 to 5 below are reordered there.

1. **Finish the small encoding subset.** Promote `delimiters_of_encode`, add the three sanity facts, and define presence and null. About a week. Escapes wait.
2. **Layer 2 definitions and the three spec theorems that force decisions:** `grouping_ambiguous`, `grouping_keeps_segments`, `empty_alternative_breaks_priority`. These are small and each records a decision glion has already made.
3. **The priority semantics and `first_reading_unique`,** following the backtracking-tree technique of the verified Pike VM paper.
4. **The engine model and the comparison against `runner` and `repair`.**
5. **Proofs about the engine:** the runner first, then the three repair properties.
6. **Layers 3 and 4** with #840.

Separately, and independent of Lean: fix the batch-file delimiter bug (#933), and decide the three parser departures (line feeds, segment IDs, letters as delimiters).

Rough effort for one person learning Lean as they go: steps 1 and 2 in two to three weeks; step 3 in three to five weeks; steps 4 and 5 in four to eight weeks, mostly in the repair's optimality proof. These are estimates without a Lean precedent for this proof.

## Risks

- **The grammar's source is not settled.** Event schemas come from the XML schemas, which disagree with the normative database on 18 groups (#838) and misspell one group name. The spec would formalize the abstract message syntax, not the bundled data, and should not encode a schema until its source is agreed.
- **No Lean precedent for the Pike VM proof.** The published proof is in Rocq. The technique transfers; the effort is an estimate.
- **Repair optimality is the hardest proof here.** Optimality is a statement about every alternative repair. The ADR cites the algorithms (Wagner 1974; Myers and Miller 1989); no mechanized proof of them was found.
- **Upkeep.** The engine changes more often than the encoding rules. Keeping the Lean model current is a cost on every engine change, as it is for Cedar on every release.
- **Data versus definitions.** 2,136 schemas and the field tables are too much to state theorems about one by one. They should be checked by running the Lean definitions, not by proving facts about each.

## Decisions to make

> Both are answered with a recommendation in [the Resonate review](./2026-10-22-resonate-spec-review.md#the-two-open-decisions-answered): yes to layer 2 next, and the specification defines all groupings, with the priority rule as a named discipline.

1. Make layer 2 (message structure) the next spec layer, ahead of escape sequences?
2. Should the spec state glion's priority rule as the meaning of "grouping", or define the set of all groupings and leave the choice to implementations, with the priority rule as glion's documented choice?

## Sources

- glion ADRs [0023](../adr/0023-event-schemas-one-engine.md), [0024](../adr/0024-segment-groups-in-the-tree.md), [0025](../adr/0025-segment-order-repair.md), [0027](../adr/0027-profile-data-mirrors-the-standard.md); issues #838, #840.
- [How verification projects choose their theorems](./2026-10-01-lean-spec-theorem-methodology.md).
- [Formal Verification for JavaScript Regular Expressions: a Proven Semantics and its Applications](https://arxiv.org/abs/2507.13091) ([ACM version](https://dl.acm.org/doi/10.1145/3776710)).

---
name: glion-lean
description: Write, change, or review the Lean 4 specification of HL7v2 in `spec/` — a definition, a well-formedness rule, a theorem or its proof, `Statements.lean`, `Oracle.lean`, or a Lean block in `spec/docs/`. Use whenever a `.lean` file in the repo is touched or a Lean statement is proposed in discussion.
---

# glion-lean

`spec/` states HL7v2 Chapter 2 in Lean and proves facts about it. People own the statements; agents write the proofs. The specification is built one lesson at a time (`spec/docs/`). This skill is the checklist for both.

## 1. The spec comes from HL7v2, not from glion

- Every definition formalizes a statement of Chapter 2 (HL7 Version 2.8.1). Part I of `spec/docs/statements.md` lists them, each with a snake_case name, the statement in plain words, its kind (definition, construction, requirement, receiver rule, recommendation) and its quoted sentence. Part I holds nothing of ours but that wording. A definition's doc comment cites the name and section: `(segment_id_is_three_characters, §2.5.2)`.
- Part II of that file is the formalization: the questions, the properties to prove, the rules with their sources, the gaps and decisions, and the table of where each statement is formalized. A new statement gets a row in Part I and in that table first; it stays **Not yet** until a lesson formalizes it.
- Never model glion's AST, its parser, or any implementation choice in `Hl7v2.Spec`.
- A rule has one of two sources: a requirement of Part I, or a fact the proof of a property needs. Where the text leaves a question open, record it under "Gaps and decisions" in Part II: open until decided, then decided with the reason (a counterexample theorem when there is one).
- HL7v2 vocabulary only, as in the rest of the repo.

## 2. Layout

Follows cedar-spec:

| Tree                 | Holds                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `Hl7v2/Spec/`        | Definitions only: the statements. No theorems.                       |
| `Hl7v2/Thm/`         | Headline theorems, one short file per topic                          |
| `Hl7v2/Thm/<Topic>/` | Lemmas and proof devices, marked "Proof device" in their doc comment |
| `Claims.lean`        | `#guard_msgs` over each headline theorem's statement and axioms      |
| `docs/statements.md` | Part I: what Chapter 2 says. Part II: the formalization built on it  |
| `docs/lesson_N.md`   | The lesson that builds a part of the specification                   |
| `scripts/`           | `check-lessons.py`: compiles the Lean blocks of every lesson         |

## 3. Naming (Mathlib convention)

| Kind                                     | Case                               | Examples                                                   |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Types, structures, `Prop` predicates     | UpperCamelCase                     | `Message`, `Segment`, `Message.WF`                         |
| Functions and data                       | lowerCamelCase                     | `encode`, `encodeField`                                    |
| `Bool` predicates                        | lowerCamelCase, `is`/`has`         | `isPopulated`                                              |
| Returns `Option`                         | trailing `?`                       | `List.find?`                                               |
| Theorems, `Prop` fields, statement names | snake_case, read as the conclusion | `decode_encode`, `represents_message_unique`, `foo_of_bar` |

## 4. Statements

- State a rule as a `Prop` with a `Decidable` instance, so `decide` proves it on a concrete message. When instance search fails on nested `∀`, name the condition and give it its own instance.
- A headline theorem's statement is a claim the owner reviews. Changing it changes `Claims.lean`; the PR says why.
- A new rule needs a source: the sentence of the standard, or a counterexample showing what goes wrong without it.

## 5. Proofs

- Only `propext` and `Quot.sound`. No `sorry`, no `native_decide`, no new `axiom`. Check with `#print axioms`; CI audits every declaration.
- `simp` only to close a goal. In the middle of a proof use `simp only [...]` (`simp?` prints the list), so a change to the simp set does not break it.
- A definition that pulls in an axiom through a library lemma (`List.getD`, `getElem` proofs) changes the axiom audit. Prefer a form that needs none, and prove facts over a finite range by `decide`.
- Prove a round trip as a left inverse (`decode (encode m) = m`); injectivity follows.

## 6. Docs and lessons

- Every definition has a doc comment (`/-- … -/`); every module a module comment (`/-! … -/`). Quote HL7v2 where it is the source.
- Doc comments state what a definition is and which statement it formalizes. No design narrative (same rule as the `glion-tsdoc` skill).
- A lesson starts from statements of the standard or from a claim, never from where glion stands or how the specification used to be.
- Lean code in `spec/docs/` is fenced `lean`. A block that is an excerpt or is meant to fail is fenced `lean skip`. Lean's output, diagrams and HL7v2 text are fenced `text`.
- Every `lean` block of a lesson compiles in order, and every `#eval` comment matches its output: `python3 scripts/check-lessons.py` checks both, and CI runs it.

## 7. Before a change is done

1. `cd spec && lake build`: every definition and proof.
2. `python3 scripts/check-lessons.py`: every lesson.
3. `docs/statements.md` matches the change: statements marked, properties and rules listed, gaps decided or left open.

## Banned

| Pattern                                             | Why                                                |
| --------------------------------------------------- | -------------------------------------------------- |
| A definition shaped after glion's tree or behaviour | The spec states HL7v2; glion is checked against it |
| A rule with no statement and no proof that needs it | Every rule has a source                            |
| `sorry`, `native_decide`, `axiom`                   | Breaks the axiom audit                             |
| Non-terminal bare `simp`                            | Breaks when the simp set changes                   |

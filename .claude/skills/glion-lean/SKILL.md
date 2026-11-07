---
name: glion-lean
description: Write, change, or review the Lean 4 specification of HL7v2 in `spec/` — a definition, a well-formedness rule, a theorem or its proof, `Statements.lean`, `Oracle.lean`, or a Lean block in `spec/docs/`. Use whenever a `.lean` file in the repo is touched or a Lean statement is proposed in discussion.
---

# glion-lean

`spec/` states HL7v2 Chapter 2 in Lean and proves facts about it. People own the statements; agents write the proofs. This skill is the checklist for both.

## 1. The spec comes from HL7v2, not from glion

- Every definition formalizes a statement of Chapter 2 (HL7 Version 2.8.1). The README's "Statements from Chapter 2" table lists them, each with a snake_case name, its section, and the Lean definition that formalizes it. A definition's doc comment cites that name and section: `(segment_id_is_three_characters, §2.5.2)`.
- A new statement gets a row in that table first, with the quoted text and section. A statement marked **no** stays in the table until it is formalized.
- Never model glion's AST, its parser, or any implementation choice in `Hl7v2.Spec`. How glion's tree reads as a `Message` is the abstraction function in `differential/src/abstraction.ts`, on the verification side.
- Where the text leaves something open and a proof needs a rule, state it under "Decisions the specification makes" in the README, with the reason (a counterexample theorem when there is one, such as `ambiguous_without_distinct_delimiters`).
- HL7v2 vocabulary only, as in the rest of the repo.

## 2. Layout

Follows cedar-spec:

| Tree                 | Holds                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `Hl7v2/Spec/`        | Definitions only: the statements. No theorems.                                              |
| `Hl7v2/Thm/`         | Headline theorems, one short file per topic                                                 |
| `Hl7v2/Thm/<Topic>/` | Lemmas and proof devices (`decode`, `unescape`), marked "Proof device" in their doc comment |
| `Statements.lean`    | `#guard_msgs` over each headline statement, its axioms, and the rule names                  |
| `Oracle.lean`        | The spec as a program for `differential/`; runs `Spec` definitions only                     |

## 3. Naming (Mathlib convention)

| Kind                                     | Case                               | Examples                                              |
| ---------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Types, structures, `Prop` predicates     | UpperCamelCase                     | `Message`, `Piece`, `Message.WF`, `Piece.NoDelimiter` |
| Functions and data                       | lowerCamelCase                     | `encode`, `escapeChar`                                |
| `Bool` predicates                        | lowerCamelCase, `is`/`has`         | `isDefinedSequence`, `isControl`                      |
| Returns `Option`                         | trailing `?`                       | `controlChar?`                                        |
| Theorems, `Prop` fields, statement names | snake_case, read as the conclusion | `decode_encode`, `encode_injective`, `foo_of_bar`     |

A well-formedness rule is a field of `Message.WF`; its catalogue name is `well_formed_` and the field name.

## 4. Statements

- State a rule as a `Prop` with a `Decidable` instance, so `decide` proves it and `Message.failures` checks it. When instance search fails on nested `∀`, name the condition (as `Piece.NoDelimiter`) and give it its own instance.
- A headline theorem's statement is a claim the owner reviews. Changing it changes `Statements.lean`; the PR says why.
- A new rule needs a counterexample: a message that breaks only that rule and a theorem showing what goes wrong without it.

## 5. Proofs

- Only `propext` and `Quot.sound`. No `sorry`, no `native_decide`, no new `axiom`. Check with `#print axioms`; `Statements.lean` guards the headline theorems and CI audits every declaration.
- `simp` only to close a goal. In the middle of a proof use `simp only [...]` (`simp?` prints the list), so a change to the simp set does not break it.
- A definition that pulls in an axiom through a library lemma (`List.getD`, `getElem` proofs) changes the axiom guard. Prefer a form that needs none, as `hexDigit` uses `drop`/`headD`, and prove facts over a finite range by `decide`.
- For a reader written as a state machine (`readAux`): generalize the accumulator, and state each lemma with an arbitrary tail (`… ++ t`).
- Prove a round trip as a left inverse (`decode (encode m) = m`); injectivity follows.

## 6. Docs

- Every definition has a doc comment (`/-- … -/`); every module a module comment (`/-! … -/`) naming its sections. Quote HL7v2 where it is the source.
- Doc comments state what a definition is and which statement it formalizes. No design narrative (same rule as the `glion-tsdoc` skill).
- A Lean block in `spec/docs/` must compile in order, and every `#eval` comment must match its output. Check by extracting the blocks into a scratch file under the project and running `lake env lean` on it. A statement shown without a proof is a `text` block.

## 7. Before a change is done

1. `cd spec && lake build`: every proof and `Statements.lean`.
2. `lake build oracle`, then `pnpm --filter @glion/differential test:spec` when a `Spec` definition or `Oracle.lean` changed.
3. The README table, rule table and decisions match the change.

## Banned

| Pattern                                                             | Why                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| A definition shaped after glion's tree or behaviour                 | The spec states HL7v2; glion is checked against it             |
| Narrowing a rule or the generator until `differential/` passes      | The oracle stays complete; a difference is a finding to decide |
| `sorry`, `native_decide`, `axiom`                                   | Breaks the axiom audit                                         |
| Non-terminal bare `simp`                                            | Breaks when the simp set changes                               |
| Editing `Statements.lean` to make the build pass without saying why | It is the record of what the spec claims                       |

# Learning Lean, and reviewing this specification

Two things in one guide. Part 1 is a path for learning enough Lean to read this specification, in levels, each built on files in this folder. Part 2 is how to review a change to it. You can review well long before you can write proofs: the kernel checks the proofs, so a reviewer's job is the part the kernel cannot check.

## The one idea to hold on to

Lean checks that a proof proves its statement. It does not check that the statement is the one you wanted, or that a definition says what HL7v2 says. So:

| Lean guarantees                                              | You must check                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| Every proof is correct for every input, not just tested ones | Each definition matches the standard it cites                  |
| The build fails if a proof is wrong                          | Each theorem says, in English, what we claim it says           |
| `#print axioms` lists everything a proof trusts              | Its hypotheses can be met by real messages (it is not vacuous) |
|                                                              | Its rules can fail (they are not always true)                  |

Almost every serious mistake in a verified project is in the right-hand column. That is where review time goes.

# Part 1: Learning Lean, level by level

Each level has something to learn, files to read here, an exercise, and a check that you have it. Do them in order; a level takes an evening or two.

## Level 0: Run it

**Learn.** Install [elan](https://github.com/leanprover/elan) (it installs the Lean version named in `lean-toolchain`). Install VS Code and its `lean4` extension. Open the `spec/` folder, not the repo root.

**Do.**

```sh
cd spec && lake build
```

Open `Hl7v2/Thm/Encoding.lean`. Put the cursor inside a proof: the **infoview** panel shows the goal, what is left to prove at that point. Hover over any name to see its type and documentation. Ctrl-click to jump to its definition.

**Exercise.** In `ambiguous_without_distinct_delimiters`, change `component := '|'` to `component := '^'`. Watch the error appear (the two messages no longer share an encoding, so the theorem is false). Undo it.

**You have it when** you can make the build fail on purpose and read the error.

## Level 1: Definitions are programs

**Learn.** Lean is a programming language first. `def` defines a function, `structure` a record, `abbrev` a name for a type. `List Char` is a list of characters. `#eval` runs code and prints the result.

**Read.** `Hl7v2/Spec/Delimiters.lean`, then `Hl7v2/Spec/Message.lean`, then `Hl7v2/Spec/Encoding.lean`. Every definition there is executable.

**The trap.** A `Field` is a list of repetitions, a repetition a list of components, a component a list of subcomponents, a subcomponent a list of characters. So a field holding `a` is `[[[['a']]]]` (four brackets), and a segment's field list holding that one field is `[[[[['a']]]]]` (five). Getting the depth wrong is the most common error when writing an example, and Lean reports it as a type mismatch on a character. It happened while writing this guide.

**Exercise.** Make a scratch file outside the repo (or use `lake env lean --stdin`) and run:

```lean
import Hl7v2
open Hl7v2.Spec

#eval String.ofList (encode ⟨Delimiters.suggested, [], [⟨['P', 'I', 'D'], [[[[['a']]]]]⟩]⟩)
-- "MSH|^~\\&\rPID|a\r"
```

Change it to give PID a second field with two components, `PID|a|b^c`, and check the output.

**You have it when** you can predict the encoding of a small message before running it.

## Level 2: Propositions, booleans, and `decide`

**Learn.** A `Prop` is a statement that may be true or false, like `m.WF` ("message `m` is well formed"). A `Bool` is a value you can compute. A statement is **decidable** when Lean has a program that settles it; then `decide` proves it by running that program inside the kernel. `∀ x ∈ list, …` over a finite list is decidable; `∀ m : Message, …` is not, because there are infinitely many messages. That is the line between what `decide` can do and what needs a proof.

**Read.** `Hl7v2/Spec/WellFormed.lean`. `Message.WF` is a `structure` whose fields are the rules. `catalogue` gives each rule a name and a `Bool` check. `Message.failures` returns the names of the rules a message breaks.

**Exercise.**

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm

def m : Message := ⟨Delimiters.suggested, [], [⟨['P', 'I'], [[[[['a']]]]]⟩]⟩
#eval m.failures              -- which rule does a two-letter ID break?
example : ¬ m.WF := by decide -- a proof, found by running the check
```

Then build a message that breaks only `well_formed_subcomponent_no_terminator`, and one that breaks only `well_formed_repetition_has_component`.

**You have it when** you can make a message fail exactly the rule you choose.

## Level 3: Reading a theorem statement

This is the most important level for review.

**Learn.** A theorem is `theorem name (hypotheses) : conclusion`. Read it as "for all values of the variables, if the hypotheses hold, the conclusion holds". Curly braces `{m₁ m₂ : Message}` mark arguments Lean fills in itself; they are still universally quantified. `→` is "implies", `↔` "if and only if", `∧` "and", `¬` "not", `∃` "there is".

**Read.** `Hl7v2/Thm/Encoding.lean`:

```lean
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂
```

In English: for any two messages, if both are well formed and they have the same encoding, they are the same message.

**Exercise.** Write the English for `ambiguous_without_distinct_delimiters` and `wf_iff_failures_nil`. Then ask of each: what would make it trivially true? (For `encode_injective`: if no message were well formed, there would be nothing to compare. Level 5 shows how we rule that out.)

**You have it when** you can explain each headline theorem to a colleague without Lean notation, and name the hypothesis that would make it vacuous.

## Level 4: Reading a proof without writing one

**Learn.** `by` starts a proof made of **tactics**, each changing the goal shown in the infoview. You do not need to follow every step to review; you need to know what the common ones do:

| Tactic                    | Does                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `intro h`                 | Assume the hypothesis of an implication, name it `h`                               |
| `exact e`                 | The goal is exactly `e`                                                            |
| `rw [eq]`                 | Rewrite the goal using the equation `eq`, left to right (`← eq` for right to left) |
| `simp only [lemmas]`      | Simplify with exactly these lemmas; `simp` uses a large default set                |
| `obtain ⟨a, b⟩ := h`      | Split a hypothesis into its parts                                                  |
| `cases x` / `induction l` | Prove the goal for each shape of `x`, or for every list by induction               |
| `decide`                  | Settle a decidable goal by computation                                             |
| `refine ⟨?_, ?_⟩`         | Build the answer, leaving holes as new goals                                       |

**Read.** `encode_injective`'s proof is three rewrites:

```lean
rw [← decode_encode h₁, h, decode_encode h₂]
```

Step through it with the cursor. It says: `m₁` is `decode (encode m₁)`, which is `decode (encode m₂)` by `h`, which is `m₂`. All the work is in `decode_encode`, in `Hl7v2/Thm/Encoding/Decode.lean`. Step through that one too; watch the goal shrink.

**You have it when** you can say, for any proof here, which lemma does the real work.

## Level 5: Checking the checks

**Learn.** A green build proves the statements. It does not prove they are worth having. Three questions, each answered by a small `decide` theorem:

1. **Can each rule fail?** For every rule, a message that breaks it, and a theorem that the rule rejects it. A rule typed into something always true would otherwise pass forever.
2. **Do the examples reach every case?** A theorem that the examples include a repetition, an empty component, a Z-segment, every delimiter level. A rule never exercised is not being tested.
3. **Can the hypotheses be met?** A theorem that a message using every level satisfies `Message.WF`. If no message did, `encode_injective` would be true and useless.

These are the next piece of work in the plan (see `docs/research/2026-10-22-resonate-spec-review.md`).

**Exercise.** Write one of each as an `example … := by decide` in a scratch file.

**You have it when** you can say, for a given theorem, which example shows it is not vacuous.

## Level 6: Writing a small proof

**Learn.** Start with proofs `decide` or `simp` can do, then lemmas by induction on a list. Read a lemma in `Hl7v2/Thm/Data/List.lean`, such as `filter_eq_nil_iff`: a base case for the empty list, and a step that uses the lemma for the rest of the list.

**Exercise.** Prove that `trimFields` (in `Spec/Presence.lean`) never makes a list longer. Hint: `List.length_reverse`, `List.dropWhile_suffix` and `List.IsSuffix.length_le`; the proof is three lines.

**You have it when** you can write a three-line induction and fix it from the infoview.

## Level 7: How the project is put together

**Learn.**

- `lakefile.toml` declares the library `Hl7v2`. `lake build` checks every file it imports.
- One file is one module; `import Hl7v2.Spec.Message` loads `Hl7v2/Spec/Message.lean`.
- `namespace Hl7v2.Spec` puts names under that prefix; `open` lets you drop it.
- `Spec/` holds definitions only and imports nothing from `Thm/`. `Thm/` holds proofs. A checker, when it arrives, will be a third library that imports `Spec/` and changes nothing in it.
- `m.WF.header` works because a lemma is named `Hl7v2.Spec.Message.WF.header`: dot notation looks in the namespace of the type. That is why some theorems in `Thm/` are written `_root_.Hl7v2.Spec.…`.

**You have it when** you can add a new file and get it built.

## Where to learn more

- [Functional Programming in Lean](https://lean-lang.org/functional_programming_in_lean/): Lean as a programming language. Levels 1 and 2.
- [Theorem Proving in Lean 4](https://lean-lang.org/theorem_proving_in_lean4/): propositions, proofs and tactics. Levels 3, 4 and 6.
- [The Natural Number Game](https://adam.math.hhu.de/#/g/leanprover-community/nng4): tactics by playing. Level 4.
- [cedar-lean](https://github.com/cedar-policy/cedar-spec/tree/main/cedar-lean): the layout this folder follows, and its `GUIDE.md`.
- [resonate-specification](https://github.com/resonatehq/resonate-specification): the catalogue and checker approach this plan adopts; read `spec/02-abstract/properties.lean` and `spec/04-theorems/properties-check.lean`.
- [Lean Zulip](https://leanprover.zulipchat.com/), `#new members`: answers to beginner questions, usually within hours.

# Part 2: Reviewing a change

Work top to bottom; the first sections are mechanical, the later ones are judgement.

## 1. It builds, and trusts nothing new

```sh
cd spec && lake build
grep -rnE "sorry|^axiom|native_decide|implemented_by|unsafe" Hl7v2
```

- The build passes with no warnings.
- `sorry` (a hole: "assume this is proved") appears only for theorems the README lists as stated and open.
- No `axiom`, which would add an assumption nobody proved.
- No `native_decide`, which trusts the compiler instead of the kernel. Use `decide`.
- No `implemented_by` or `unsafe`, which let the running code differ from the code the proofs are about.

Then check what each headline theorem trusts:

```sh
printf 'import Hl7v2\n#print axioms Hl7v2.Thm.encode_injective\n' | lake env lean --stdin
```

The answer should be `propext` and `Quot.sound`, or nothing. `Classical.choice` is a standard axiom too, but this specification avoids it so that every result is constructive; a new appearance is worth a question. While writing `wf_iff_failures_nil`, the library lemma `List.filter_eq_nil_iff` brought it in, and `Thm/Data/List.lean` now proves its own version instead.

## 2. Definitions say what the standard says

This is the part no tool checks.

- Every definition in `Spec/` cites the section of Chapter 2 it comes from, or is listed in the README under "Decisions the specification makes".
- It uses HL7v2's words: segment, field, repetition, component, subcomponent, delimiter, encoding characters. No parser, reader, linter, tree or any glion name.
- Read the cited text and the definition side by side. Is anything narrower or wider? For example, `segment_id_length` says three characters and nothing about which characters.
- `Spec/` imports nothing from `Thm/`. Things marked "proof device" (such as `decode`) stay in `Thm/`.

## 3. Statements say what we claim

For each new or changed theorem:

- Write its English in the review. If you cannot, ask for it in the docstring.
- Check the hypotheses. Are they all needed? Could they be impossible to satisfy together? Is there an example (level 5) showing a real message meets them?
- Check the conclusion. Is it as strong as the docstring claims? `↔` and `=` are strong; `→` in only one direction may be weaker than intended.
- **A changed statement is a changed claim.** If a theorem keeps its name but its hypotheses grow, what it promises shrank. That belongs in the PR description, not only the diff.

## 4. Rules come with their checks

For each new rule in the catalogue:

- Its name is `well_formed_` and its field name, and it is in the README table.
- There is a message it rejects (falsifiable), and the examples reach the case it guards.
- `wf_iff_failures_nil` still builds, which shows the catalogue and `Message.WF` agree.

## 5. Proofs are maintainable

You do not need to follow every step. Look for:

- `simp only [...]` with a named list rather than a bare `simp` in long proofs; a bare `simp` breaks when Lean's library changes.
- Long proofs split into named lemmas in a folder beside the headline file.
- No proof that takes seconds to check without a comment saying why.

## A worked review: the catalogue change

Applying the checklist to the change that introduced the rule catalogue:

1. **Builds, trusts nothing new.** The build is clean; `grep` finds no escape hatch; all three headline theorems use `propext` and `Quot.sound` only.
2. **Definitions.** `Message.WF` used to have three fields, with a separate `Field.WF` bundling four conditions. It now has seven fields, one per rule, over `Message.fields` (MSH-3 onward, then every later segment's fields). Check that the seven together say the same as the old three: the four field conditions are the old `Field.WF` split apart, and `Thm/WellFormed.lean` rebuilds the old shape (`FieldWF`, `SegmentWF`) from them. `decode_encode` still proves unchanged, which shows nothing was weakened.
3. **Statements.** New theorem `wf_iff_failures_nil`: "a message is well formed exactly when the catalogue names no failure." It is an `↔`, so the catalogue can neither miss a rule nor add one.
4. **Rules.** Seven names in the README table. Falsifiability and reach examples are not in yet: they are piece 2 of the plan.
5. **Proofs.** Short. `wf_iff_failures_nil` uses `simp only` with a named list; the new list lemma uses a bare `simp` on a two-line induction, where a library change would be easy to repair.

The review's open question for the author: `segment_id_length` checks the length but not which characters an ID may use. What does Chapter 2 say about them, and should a rule follow it?

## Glossary

| Term         | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| Kernel       | The small core of Lean that checks every proof; the only part you have to trust |
| Goal         | What is left to prove at a point in a proof, shown in the infoview              |
| Tactic       | A command inside `by` that changes the goal                                     |
| `Prop`       | A statement; it may not be computable                                           |
| `Bool`       | A computed true or false                                                        |
| Decidable    | A statement Lean has a program to settle                                        |
| `decide`     | Proves a decidable statement by running its program in the kernel               |
| `sorry`      | A placeholder that pretends a proof exists; the build warns about it            |
| Axiom        | An assumption accepted without proof                                            |
| Vacuous      | True only because its hypotheses can never hold                                 |
| Falsifiable  | Has an input that makes it false; a rule must be                                |
| Lemma        | A theorem used to prove another                                                 |
| Proof device | A definition that exists only to help a proof, such as `decode`                 |

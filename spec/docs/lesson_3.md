# Lesson 3: Reading a proof, one piece at a time

By the end of this lesson you can read the proof of `wf_iff_failures_nil` in `Hl7v2/Thm/WellFormed.lean` line by line. We get there in seven small steps. Each step adds one idea, shows it on a tiny example, and ends with a short exercise.

Create a new file `Hl7v2/Lesson3.lean`, start it with these lines, and paste each example below them as you go:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm

def good : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[data "1"]]]]⟩]⟩
```

Every example in this lesson builds without errors.

## The one idea behind everything

**A claim is a type. A proof is a value of that type.**

You already know `def x : Nat := 5`: the type is `Nat`, the value is `5`. A theorem has the same shape:

```lean
theorem good_distinct : good.delimiters.Distinct := by decide
```

The type is the claim `good.delimiters.Distinct`. The value after `:=` is the proof. If Lean cannot build a value of that type, the build fails, so a theorem that builds is a claim that holds.

Everything else in this lesson is about **how to build proof values** for different shapes of claim.

## Step 1: Claims about one message (you know this)

When a claim is about one concrete message, `decide` checks it by running a program, as in `good_distinct` above:

```lean
#check good_distinct   -- good_distinct : good.delimiters.Distinct
```

`#check` shows the theorem's name and its type, which is its claim. Once proved, `good_distinct` is a value you can use anywhere a proof of that claim is needed.

**Exercise.** Prove that every segment ID of `good` is three characters long.

<details><summary>Answer</summary>

```lean
example : ∀ s ∈ good.segments, s.id.length = 3 := by decide
```

</details>

## Step 2: "And" (`∧`)

`A ∧ B` claims that both `A` and `B` hold. A proof of it is a pair: a proof of `A` and a proof of `B`, written `⟨proofOfA, proofOfB⟩`.

```lean
example : good.delimiters.Distinct ∧ (∀ s ∈ good.segments, s.id.length = 3) :=
  ⟨by decide, by decide⟩
```

Going the other way, if `h` proves `A ∧ B`, then `h.1` proves `A` and `h.2` proves `B`:

```lean
example (P Q : Prop) (h : P ∧ Q) : Q := h.2
```

Read the line as: "for any claims `P` and `Q`, given a proof `h` of `P ∧ Q`, here is a proof of `Q`: the second half of `h`."

**Exercise.** Given a proof of `P ∧ Q`, prove `Q ∧ P`.

<details><summary>Answer</summary>

```lean
example (P Q : Prop) (h : P ∧ Q) : Q ∧ P := ⟨h.2, h.1⟩
```

Take both halves out of `h`, and put them back in the other order.

</details>

## Step 3: "If … then" (`→`) and `intro`

`A → B` claims "if `A` holds, then `B` holds". To prove it, you assume `A` and then prove `B`. The tactic `intro h` does the assuming: it moves `A` above the line and names it `h`.

```lean
example (P Q : Prop) : P ∧ Q → Q ∧ P := by
  intro h
  exact ⟨h.2, h.1⟩
```

Put your cursor at the end of each line and watch the infoview. The goal is what is left to prove (below `⊢`); the facts you have are above it.

| After              | Infoview                                    |
| ------------------ | ------------------------------------------- |
| `by`               | `⊢ P ∧ Q → Q ∧ P`                           |
| `intro h`          | `h : P ∧ Q` above the line, `⊢ Q ∧ P` below |
| `exact ⟨h.2, h.1⟩` | No goals: the proof is finished             |

`exact` means "here is the value that finishes the goal".

This is the same as step 2's exercise. The only difference is that `P ∧ Q` arrives through `intro` instead of being given up front.

## Step 4: "If and only if" (`↔`) and `constructor`

`A ↔ B` claims both directions: `A → B` and `B → A`. The tactic `constructor` splits the goal into those two, and each `·` proves one of them.

```lean
example (P Q : Prop) : P ∧ Q ↔ Q ∧ P := by
  constructor
  · intro h
    exact ⟨h.2, h.1⟩
  · intro h
    exact ⟨h.2, h.1⟩
```

After `constructor`, the infoview shows two goals, named `mp` (left to right) and `mpr` (right to left). Each `·` block is step 3 again.

## Step 5: `rintro`, unpacking as you assume

`rintro ⟨hp, hq⟩` is `intro`, then taking the pair apart, in one step. Instead of `h` with `h.1` and `h.2`, you get the two halves with their own names:

```lean
example (P Q : Prop) : P ∧ Q → Q ∧ P := by
  rintro ⟨hp, hq⟩
  exact ⟨hq, hp⟩
```

After `rintro`, the infoview shows `hp : P` and `hq : Q` above the line.

## Step 6: A structure of rules is an "and" with names

`Message.WF` is a `structure` whose fields are proofs. Here is a smaller one with two rules:

```lean
structure TwoRules (m : Message) : Prop where
  distinct : m.delimiters.Distinct
  idLength : ∀ s ∈ m.segments, s.id.length = 3
```

A proof of `TwoRules m` holds two proofs, just like a proof of an "and". Only the way you reach them changes: `h.distinct` or `h.1` for the first, `h.idLength` or `h.2` for the second. So `TwoRules m` and the plain "and" of its two rules say the same thing:

```lean
example (m : Message) :
    TwoRules m ↔ m.delimiters.Distinct ∧ (∀ s ∈ m.segments, s.id.length = 3) := by
  constructor
  · intro h
    exact ⟨h.1, h.2⟩
  · rintro ⟨h1, h2⟩
    exact ⟨h1, h2⟩
```

Read it with steps 2 to 5: split the `↔`; going right, take the two fields out of `h` and pair them; going left, unpack the pair and build the structure from the halves.

**Look back at the real proof now.** The last four lines of `wf_iff_failures_nil` are this same proof, with ten rules instead of two:

```lean
  constructor
  · intro hm
    exact ⟨hm.1, hm.2, hm.3, hm.4, hm.5, hm.6, hm.7, hm.8, hm.9, hm.10⟩
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩
    exact ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩
```

## Step 7: `simp only`, unfolding definitions

One piece is left: the `simp only […]` line at the top of the proof. Its job is to rewrite the goal using the definitions and facts listed in the brackets, and nothing else.

A tiny definition first:

```lean
def shout (s : List Char) : List Char := s ++ ['!']

example : shout ['h', 'i'] = ['h', 'i', '!'] := by
  simp only [shout]
  rfl
```

| After               | Goal                                      |
| ------------------- | ----------------------------------------- |
| `by`                | `⊢ shout ['h', 'i'] = ['h', 'i', '!']`    |
| `simp only [shout]` | `⊢ ['h', 'i'] ++ ['!'] = ['h', 'i', '!']` |
| `rfl`               | No goals                                  |

`simp only [shout]` replaced `shout` with its definition. `rfl` finishes a goal whose two sides compute to the same value.

Now the same tool on the real definitions:

```lean
example (m : Message) : m.failures = [] ↔ ∀ r ∈ catalogue, r.holds m = true := by
  simp only [Message.failures, List.map_eq_nil_iff, filter_eq_nil_iff, Bool.not_eq_false']
```

Each name in the brackets does one rewrite:

| Name                  | Rewrites                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `Message.failures`    | `m.failures` into its definition: the names of the rules whose check is `false` |
| `List.map_eq_nil_iff` | "the list of names is empty" into "the list of broken rules is empty"           |
| `filter_eq_nil_iff`   | "no rule is broken" into "every rule's check is not `false`"                    |
| `Bool.not_eq_false'`  | "not `false`" into "`true`"                                                     |

After these four rewrites, both sides say the same thing, so `simp only` closes the goal by itself.

The real proof lists more names. `catalogue` unfolds the list into its ten checks, and the others turn "every check in this ten-item list is `true`" into the ten rules joined by `∧`. When it finishes, the goal is:

```
⊢ m.WF ↔ rule1 ∧ rule2 ∧ rule3 ∧ rule4 ∧ rule5 ∧ rule6 ∧ rule7 ∧ rule8 ∧ rule9 ∧ rule10
```

That is exactly step 6.

## Putting it together

You can now read every line of the proof:

```lean
theorem wf_iff_failures_nil {m : Message} : m.WF ↔ m.failures = [] := by
  simp only [Message.failures, …]           -- step 7: the catalogue becomes ten rules joined by ∧
  constructor                                -- step 4: split into two directions
  · intro hm                                 -- step 3: assume m.WF
    exact ⟨hm.1, hm.2, hm.3, hm.4, hm.5, hm.6, hm.7, hm.8, hm.9, hm.10⟩   -- steps 2 and 6: take its fields, pair them
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩      -- step 5: assume the ten rules, unpacked
    exact ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩       -- step 6: build m.WF from them
```

**Final exercise.** Open `Hl7v2/Thm/WellFormed.lean`, put your cursor after `simp only […]`, and compare the goal with the table in step 7. Then place it after `constructor` and find the two goals `mp` and `mpr`.

## Going further

[The lesson 3 appendix](lesson_3_appendix.md) answers the questions that came up during this lesson: what a proof really is, why the rules exist twice, every lemma in the `simp only` line, and how to find such lemmas yourself.

## What's next

[Lesson 4](lesson_4.md) reads the main theorem, `encode_injective`: two well-formed messages with the same text are the same message. Its proof is three lines long, and uses one new idea: rewriting with an equation you have proved.

# Lesson 3, appendix: questions about proofs

The questions that came up while reading [lesson 3](lesson_3.md), with their answers. Read it after the lesson, or jump to the question you have.

Paste the examples at the end of your `Hl7v2/Lesson3.lean`. Every example builds without errors, except the ones marked as showing an error.

## 1. A proof is a function

```lean
example (P Q : Prop) (h : P ∧ Q) : Q := h.2
```

That line is a function. It says: give me proof that two things are both true, and I'll hand you proof that the second one is true. In TypeScript:

```ts
function second<P, Q>(h: [P, Q]): Q {
  return h[1];
}
```

| Lean           | TypeScript    | Meaning                                         |
| -------------- | ------------- | ----------------------------------------------- |
| `(P Q : Prop)` | `<P, Q>`      | Any two claims, which could be anything         |
| `(h : P ∧ Q)`  | `h: [P, Q]`   | Input: a proof that both are true. It's a pair. |
| `: Q`          | `: Q`         | Output: a proof that `Q` is true                |
| `:= h.2`       | `return h[1]` | Take the second half of the pair                |

With real HL7v2 claims about `good`:

```lean
theorem both : good.delimiters.Distinct ∧ (∀ s ∈ good.segments, s.id.length = 3) :=
  ⟨by decide, by decide⟩

#check both.1   -- proof that the delimiters are distinct
#check both.2   -- proof that every segment ID is three characters

theorem second (P Q : Prop) (h : P ∧ Q) : Q := h.2
#check second _ _ both   -- ∀ s ∈ good.segments, s.id.length = 3
```

Lean prints the halves as `both.left` and `both.right`: those are the names it gives `.1` and `.2` for an "and". The two `_` tell Lean to work out `P` and `Q` itself, from `both`.

`Message.WF` is a bundle of eight proofs, one per rule; a pair is a bundle of two. In the real proof, `hm.1` … `hm.8` take the eight proofs out of the bundle, just as `h.2` takes the second proof out of the pair.

## 2. Statement or proof? How does Lean know it is always true?

The line is both. The part before `:=` is the **statement**, and the part after it is the **proof**.

```text
example (P Q : Prop) (h : P ∧ Q) : Q   :=   h.2
└──────────── statement ─────────────┘      └ proof ┘
```

Lean's method has only one step: it checks that the proof has the type the statement asks for, the way TypeScript checks that a function returns what it declared. Lean never runs this line on examples, and it never tests anything. It only type-checks it:

1. You promised to return something of type `Q`.
2. `h` has type `P ∧ Q`, a pair.
3. `h.2` is the second half of that pair, so its type is `Q`.
4. That matches what you promised. Accepted.

This example shows an error, on purpose. Take the wrong half:

```lean
example (P Q : Prop) (h : P ∧ Q) : Q := h.1
-- error: Type mismatch: h.left has type P but is expected to have type Q
```

**Why passing the type check means "always true".** Two reasons:

- **A value of type `P ∧ Q` can only be made one way.** Lean's definition of "and" (`#print And`) is a structure with two fields, `left : a` and `right : b`. To build one, you must supply a proof of `P` _and_ a proof of `Q`. So whenever an `h : P ∧ Q` exists, a proof of `Q` is inside it.
- **Lean checks it once, for every possible P and Q.** `P` and `Q` are like generics in TypeScript. Lean checks `h.2` without knowing what they are, so the result holds for all of them.

**A false statement can't be proved.** This example shows an error, on purpose. Change "and" to "or":

```lean
example (P Q : Prop) (h : P ∨ Q) : Q := h.2
-- error: Invalid projection … h has type `P ∨ Q`
```

"If P or Q is true, then Q is true" is false: only `P` might be true. A proof of `P ∨ Q` holds only _one_ side, so there's no second half to take. The only way past Lean without a real proof is `sorry`, which means "trust me", and Lean warns `declaration uses 'sorry'`.

## 3. Where is "true" enforced?

The statement never says "true" because, in Lean, having a proof of a claim _is_ what "true" means. A claim is true when a proof of it exists, and false when none can ever be built.

So `(h : P ∧ Q) : Q` reads: **if** you give me a proof that P and Q are both true, **then** I give you a proof that Q is true. It says nothing about the case where they aren't both true. In that case there's no proof to give it, so the function can never be called.

Truth is checked when someone tries to create the `h`. This example shows an error, on purpose:

```lean
def shortId : Message := ⟨Delimiters.suggested, [], [⟨"PI".toList, [[[["1".toList]]]]⟩]⟩

theorem idsOk : shortId.delimiters.Distinct ∧ (∀ s ∈ shortId.segments, s.id.length = 3) :=
  ⟨by decide, by decide⟩
-- error: Tactic `decide` proved that the proposition … is false
```

The second half can't be proved, so the pair can't be built, so `idsOk` doesn't exist, and nobody can call `second` with it.

| You want to say              | You write     | Proved by                                    |
| ---------------------------- | ------------- | -------------------------------------------- |
| A is true                    | `A`           | A proof of `A`                               |
| A is false                   | `¬ A`         | A proof that `A` can't hold                  |
| If A is true, then B is true | `(h : A) : B` | A function from a proof of A to a proof of B |

**If a proof exists, the claim is true.** There's no such thing as a false proof. A claim can be false; a proof can't. And a true claim can still be unproved, because nobody has written the proof yet.

That is why the statements are what you review. Lean guarantees that each proof proves its claim. It can't guarantee that the claim is the one you meant.

## 4. Why the `TwoRules` proof matters

```lean
structure TwoRules (m : Message) : Prop where
  distinct : m.delimiters.Distinct
  idLength : ∀ s ∈ m.segments, s.id.length = 3

example (m : Message) :
    TwoRules m ↔ m.delimiters.Distinct ∧ (∀ s ∈ m.segments, s.id.length = 3) := by
  constructor
  · intro h
    exact ⟨h.1, h.2⟩
  · rintro ⟨h1, h2⟩
    exact ⟨h1, h2⟩
```

The same two rules, written two ways: a box with two **named** slots, and a pair with two **unnamed** slots. The proof moves the two proofs from either container into the other. Nothing is calculated, and nothing about HL7v2 is used. It works because both containers hold the same claims in the same order.

In the real spec, the eight rules are written twice, as `Message.WF` and as `catalogue`. Any time something is written twice, the two copies can drift apart: someone tightens a rule in one place and forgets the other. Then the proofs are about one set of rules while glion is checked against another, and everything still builds. `wf_iff_failures_nil` is the seven-rule version of this example, and because it's proved, the copies can't drift. Changing one catalogue check from `length = 3` to `length ≤ 3` stops the proof building, at the line `exact ⟨hm.1, …⟩`.

You don't need to write proofs like this; an agent can. You need to judge three things:

1. **What it guarantees:** "the runnable checks and the logical rules are the same rules."
2. **Whether it's suspiciously easy or hard.** This proof is supposed to be boring. If it suddenly needed 200 lines, something changed in what the two sides say.
3. **What breaks it:** a rule written in one place but not the other. When the build fails here, compare the two lists; don't fix the proof.

## 5. `intro` and `rintro`

Both say "suppose someone hands me a proof". `intro` gives you the whole package; `rintro` opens it and names each piece.

|                          | `intro h`    | `rintro ⟨h1, h2⟩`   |
| ------------------------ | ------------ | ------------------- |
| After it, above the line | `h : P ∧ Q`  | `h1 : P`, `h2 : Q`  |
| How you reach the pieces | `h.1`, `h.2` | `h1`, `h2` directly |

```lean
example (P Q : Prop) : P ∧ Q → Q ∧ P := by
  intro h
  exact ⟨h.2, h.1⟩

example (P Q : Prop) : P ∧ Q → Q ∧ P := by
  rintro ⟨hp, hq⟩
  exact ⟨hq, hp⟩
```

The `r` stands for "recursive": it can open nested packages, as in `rintro ⟨h1, h2, h3⟩`.

**Could the real proof use `rintro` on both sides?** Yes, and it builds:

```lean
example {m : Message} : m.WF ↔ m.failures = [] := by
  simp only [Message.failures, List.map_eq_nil_iff, filter_eq_nil_iff, catalogue,
    List.mem_cons, List.not_mem_nil, or_false, forall_eq_or_imp, forall_eq,
    Bool.not_eq_false', decide_eq_true_eq]
  constructor
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩
    exact ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩
    exact ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩
```

The original mixes them because the two sides are packaged differently. `Message.WF` is flat, one structure with eight slots, so `hm.1` … `hm.8` reach each rule directly. The eight rules joined by `∧` are nested: `A ∧ B ∧ C` means `A ∧ (B ∧ C)`, so `h.2` is "everything after the first rule":

```lean
example (A B C : Prop) (h : A ∧ B ∧ C) : B ∧ C := h.2
```

With `intro` on that side, you'd write `⟨h.1, h.2.1, h.2.2.1, h.2.2.2.1, h.2.2.2.2.1, h.2.2.2.2.2.1, h.2.2.2.2.2.2.1, h.2.2.2.2.2.2.2⟩`. All three versions build; they differ only in how easy they are to read.

## 6. Why both `Message.WF` and `catalogue`?

The spec has two jobs that want the same rules in different shapes.

| Job                                                                                                                                | Needs                                                                                      | Gets it from |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| **Prove things**, such as `encode_injective`                                                                                       | Rules as logical statements, each with a name a proof can use, like `hm.segment_id_length` | `Message.WF` |
| **Check real messages** and say _which_ rule failed, for example when the spec is run against glion's parser on generated messages | Rules as code that runs, each with a printable name, in a list you can loop over           | `catalogue`  |

**With only `Message.WF`**, you get a single yes or no. A `structure` isn't a list you can walk through and print names from. When glion and the spec disagree on a message, "rule `well_formed_subcomponent_no_terminator` failed" is what you need to see.

**With only `catalogue`**, proofs get clumsy: instead of `hm.segment_id_length`, a proof has to say "the second item of the catalogue returns `true` on `m`", then turn that back into a statement. And the rules stop reading like the standard: `segment_id_length : ∀ s ∈ m.segments, s.id.length = 3` reads like §2.5.2; a list of `decide` calls reads like code.

The cost is writing the rules twice, and `wf_iff_failures_nil` pays it. Two other designs exist: generate the catalogue from `Message.WF` with metaprogramming (more machinery than eight rules justify), or define `Message.WF` as `m.failures = []` (one copy, but no named statements for proofs). With eight rules, two copies plus one short proof is the simplest.

## 7. What `simp only` does, one lemma at a time

```text
simp only [Message.failures, List.map_eq_nil_iff, filter_eq_nil_iff, catalogue,
  List.mem_cons, List.not_mem_nil, or_false, forall_eq_or_imp, forall_eq,
  Bool.not_eq_false', decide_eq_true_eq]
```

The goal starts as `m.WF ↔ m.failures = []`. `simp only` rewrites the right side, using only the names in the brackets, until it becomes the eight rules joined by `∧`. Two of the names are **definitions** (`Message.failures`, `catalogue`), which `simp only` replaces by their contents. The other nine are **lemmas**, each an already-proved "this means the same as that".

To keep the goals short, the table uses a catalogue of two rules, `r1` (distinct delimiters) and `r2` (three-character IDs). `simp only` doesn't run them in a fixed order; it keeps applying whichever fits. The order below is the order in which they become useful.

| #   | Name                  | Kind        | Statement                                                                   | The goal turns from …         | … into                          |
| --- | --------------------- | ----------- | --------------------------------------------------------------------------- | ----------------------------- | ------------------------------- |
| 1   | `Message.failures`    | definition  | `m.failures` is `(catalogue.filter fun rule => !rule.holds m).map (·.name)` | `m.failures = []`             | names of failing rules = `[]`   |
| 2   | `List.map_eq_nil_iff` | list lemma  | `List.map f l = [] ↔ l = []`                                                | names of failing rules = `[]` | failing rules = `[]`            |
| 3   | `filter_eq_nil_iff`   | list lemma  | `List.filter p l = [] ↔ ∀ a ∈ l, p a = false`                               | failing rules = `[]`          | ∀ rule ∈ catalogue, not failing |
| 4   | `catalogue`           | definition  | `catalogue` is `[r1, r2]`, that is `r1 :: r2 :: []`                         | ∀ rule ∈ catalogue            | ∀ rule ∈ `[r1, r2]`             |
| 5   | `List.mem_cons`       | list lemma  | `a ∈ b :: l ↔ a = b ∨ a ∈ l`                                                | ∈ `[r1, r2]`                  | = r1 ∨ = r2 ∨ ∈ `[]`            |
| 6   | `List.not_mem_nil`    | list lemma  | `¬ a ∈ []`                                                                  | ∈ `[]`                        | `False`                         |
| 7   | `or_false`            | logic lemma | `(p ∨ False) = p`                                                           | … ∨ `False`                   | …                               |
| 8   | `forall_eq_or_imp`    | logic lemma | `(∀ a, a = a' ∨ Q a → P a) ↔ P a' ∧ (∀ a, Q a → P a)`                       | ∀ rule that is r1 or r2       | r1 ∧ ∀ rule that is r2          |
| 9   | `forall_eq`           | logic lemma | `(∀ a, a = a' → p a) ↔ p a'`                                                | ∀ rule that is r2             | r2                              |
| 10  | `Bool.not_eq_false'`  | Bool lemma  | `((!b) = false) = (b = true)`                                               | not-fails = false             | check = true                    |
| 11  | `decide_eq_true_eq`   | Bool lemma  | `(decide p = true) = p`                                                     | check = true                  | the rule holds                  |

The whole journey on one page:

```text
m.failures = []                                      names of failing rules: none
  ⇣ 1  unfold failures
map name (filter fails catalogue) = []
  ⇣ 2  names don't matter
filter fails catalogue = []                          list of failing rules: empty
  ⇣ 3  empty filter = every item rejected
∀ a ∈ catalogue, ¬ fails a                           every rule passes its check
  ⇣ 4 to 9  unfold the list, split per rule
check₁ passes ∧ check₂ passes                        one ∧ per rule
  ⇣ 10, 11  "check returns true" = "rule holds"
Distinct ∧ (∀ s, length = 3)                         the rules themselves
```

- **Steps 1 to 4** remove the code: names, filters and the catalogue's list structure.
- **Steps 5 to 9** turn "for every rule in the list" into one `∧` per rule. With eight rules, `forall_eq_or_imp` is applied seven times, peeling off one rule each time.
- **Steps 10 and 11** turn each `Bool` check back into its logical rule.

After all eleven, the goal is `m.WF ↔ rule1 ∧ … ∧ rule8`, and the four lines after `simp only` close it by unpacking and repacking.

None of the nine lemmas mentions HL7v2. The only HL7v2 content is what the two definitions unfold into. That's why this proof only shows that the checks and the rules match, and why it fails when they don't: a loosened check produces `length ≤ 3` against the rule's `length = 3` at step 11, and an eighth catalogue check produces eight `∧`s against seven fields at step 9.

You can watch it yourself on a two-rule catalogue:

```lean
def mini : List Rule :=
  [ ⟨"distinct",  fun m => decide m.delimiters.Distinct⟩,
    ⟨"id_length", fun m => decide (∀ s ∈ m.segments, s.id.length = 3)⟩ ]

def _root_.Hl7v2.Spec.Message.miniFailures (m : Message) : List String :=
  (mini.filter fun rule => !rule.holds m).map (·.name)

example (m : Message) :
    m.miniFailures = [] ↔ m.delimiters.Distinct ∧ (∀ s ∈ m.segments, s.id.length = 3) := by
  simp only [Message.miniFailures, List.map_eq_nil_iff, filter_eq_nil_iff, mini,
    List.mem_cons, List.not_mem_nil, or_false, forall_eq_or_imp, forall_eq,
    Bool.not_eq_false', decide_eq_true_eq]
```

Here `simp only` closes the goal by itself, because the right side is a plain `∧` rather than a structure. Delete names from the brackets one at a time, from the end, and watch where the goal stops.

## 8. What is a lemma?

A lemma is a theorem whose job is to help prove other theorems: a small proved fact you reuse, the way a helper function supports the main code. To Lean there's no difference; both are written with `theorem`. "Lemma" only describes the role.

|                         | Theorem (headline)                        | Lemma                                   |
| ----------------------- | ----------------------------------------- | --------------------------------------- |
| Role                    | The result you care about                 | A step on the way to it                 |
| Example in the spec     | `encode_injective`: one text, one meaning | `filter_eq_nil_iff`: a fact about lists |
| Who reads its statement | You, carefully                            | Usually nobody; it only has to build    |

The spec's folders follow that split:

```text
Thm/Encoding.lean          ← headline: encode_injective (one-line proof)
Thm/Encoding/Decode.lean   ← lemmas: decode_encode and the steps it needs
Thm/Data/List.lean         ← lemmas: general facts about lists
```

**You review headline statements.** They say what the spec claims. **Lemmas only have to build.** If a lemma's statement were wrong, it couldn't be proved, or it wouldn't help prove the headline theorem; either way the build fails.

### Reading a lemma's name

Lean lemma names spell out their statement:

| Part             | Means                                                    |
| ---------------- | -------------------------------------------------------- |
| `List.`          | A fact about lists                                       |
| `map` / `filter` | About `xs.map f` / `xs.filter p`                         |
| `eq_nil`         | "…equals the empty list" (`nil` is Lean's name for `[]`) |
| `iff`            | "…if and only if…" (`↔`)                                 |

### `List.map_eq_nil_iff`

**The result of `map` is empty exactly when the list you started with is empty.** `map` changes each item but never adds or removes one:

```lean
#check @List.map_eq_nil_iff
#eval [1, 2, 3].map (· * 10)          -- [10, 20, 30]   3 in, 3 out
#eval ([] : List Nat).map (· * 10)    -- []             0 in, 0 out
#check @List.length_map               -- (List.map f as).length = as.length
```

In the proof, it turns "the list of _names_ of failing rules is empty" into "the list of failing _rules_ is empty".

### `filter_eq_nil_iff`

**Filtering a list keeps nothing exactly when every item fails the test.**

```lean
#check @filter_eq_nil_iff
#eval [1, 2, 3, 4].filter (· > 2)   -- [3, 4]   3 and 4 pass, so they're kept
#eval [1, 2].filter (· > 2)         -- []       nothing passes, so nothing is kept
```

In the proof, the test is "the rule _fails_", so it turns "no rule fails" into `∀ rule ∈ catalogue, (!rule.holds m) = false`: a list operation becomes a "for every" statement, which later steps split into one `∧` per rule.

**Why the spec has its own copy.** Lean already has `List.filter_eq_nil_iff`, but:

```lean
#print axioms List.filter_eq_nil_iff   -- [propext, Classical.choice, Quot.sound]
#print axioms filter_eq_nil_iff        -- [propext, Quot.sound]
```

An **axiom** is a fact Lean accepts without proof; every proof ultimately rests on a few. `Classical.choice` is safe, but it lets a proof claim something exists without showing how to find it. The spec allows only `propext` and `Quot.sound`, so it proves its own five-line version in `Thm/Data/List.lean`.

## 9. How do you know which lemmas you need?

Nobody works out that list by hand. You decide **where you want to end up**, ask Lean to find a route there, and then trim what it gives you.

**The hint: the two sides look different.** In `m.WF ↔ m.failures = []`, the left side is logic and the right side is code (run checks, keep the failing ones, take their names, test for empty). The plan almost writes itself: rewrite the code side until it's written in the logic side's language. Ask what's on one side that isn't on the other: here `failures`, `filter`, `map`, `catalogue` and `Bool`. Each of those has to be unfolded or rewritten away.

**The tool: let Lean find the lemmas.** `simp?` tries every rewrite it knows and reports which ones worked. It is a tactic, so it only works inside a `by` block:

```lean
example {m : Message} : m.WF ↔ m.failures = [] := by
  simp? [Message.failures, catalogue]
  sorry
```

Put your cursor on the `simp?` line. The infoview shows:

```text
Try this:
  simp only [Message.failures, catalogue, ne_eq, List.map_eq_nil_iff, List.filter_eq_nil_iff,
    List.mem_cons, List.not_mem_nil, or_false, Bool.not_eq_eq_eq_not, Bool.not_true,
    Bool.not_eq_false, forall_eq_or_imp, decide_eq_true_eq, forall_eq]
```

That's almost exactly the list in the file. The `sorry` stands in for the rest of the proof, so Lean warns "declaration uses `sorry`", which is expected.

| Where you put `simp?`                                   | What happens                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| On a line of its own, not inside a proof                | `error: unexpected identifier; expected command`. Lean expects a command such as `example` or `#eval` there |
| After the existing `simp only […]` in `WellFormed.lean` | It runs, but suggests only `simp only [ne_eq]`: the goal has already been rewritten                         |
| In a file without `open Hl7v2.Spec Hl7v2.Thm`           | Lean doesn't recognize `Message` or `catalogue`                                                             |

**Then trim it.** The suggestion uses Lean's `List.filter_eq_nil_iff`, which brings in `Classical.choice`. So the author found that lemma with `#print axioms`, proved a replacement without it, and swapped it in; that made `ne_eq` and three `Bool` lemmas unnecessary, and `Bool.not_eq_false'` took their place.

**Why `simp only […]` rather than plain `simp`.** Plain `simp` uses Lean's whole library of rewrite lemmas. When Lean is upgraded and that library changes, a plain `simp` can quietly change what it leaves behind. `simp only […]` names every step, so the proof does the same thing on every version.

### Do people just rely on `simp?`

Mostly yes. For small steps, people let Lean find the lemmas and rarely polish the list. The usual rule (a Mathlib style rule): when `simp` finishes the goal by itself, leave it as plain `simp`; when more tactics come after it, as here, freeze it as `simp only […]`, usually by pasting what `simp?` prints. Real trimming happens for a reason, such as the axiom rule here, or speed.

| Tool                          | Answers                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `simp?`                       | Rewrite as far as you can, and tell me which lemmas you used                            |
| `exact?`                      | Is there one lemma that closes this goal exactly?                                       |
| `apply?`                      | Which lemmas could make progress on this goal?                                          |
| `rw?`                         | Which single rewrite could apply here?                                                  |
| Loogle, LeanSearch (websites) | Search the library by pattern or in plain English                                       |
| `decide`, `omega`, `grind`    | Prove the goal outright, if it's a finite check, simple arithmetic, or a common pattern |

```lean
example (l : List Nat) (f : Nat → Nat) : l.map f = [] ↔ l = [] := by exact?
```

What automation doesn't do is the part that needs understanding: **the statement** (what is worth claiming), **the definitions** (whether `Message.WF` matches Chapter 2), **the plan of a hard proof** (someone had to invent `decode` for `encode_injective`), and **splitting a proof into lemmas** small enough for automation. That glue work used to be most of a proof engineer's time; agents now do it quickly with the tools above. Your skill is reading a statement, recognizing what kind of step a proof takes, and knowing the warning signs: `sorry`, an unexpected axiom, a statement that changed.

## 10. `Message.WF.field`, `.header` and `.segment`

These three lemmas in `Thm/WellFormed.lean` **reshape** `Message.WF`. They add no rule; they regroup the rules the way the encoding proof needs them. `wf_iff_failures_nil` doesn't use them; `decode_encode` (lesson 4) does.

`Message.WF` states each rule over the **whole message**, one rule per line, which is the right shape for reading against Chapter 2. But the decoding proof works **one field at a time**, so it wants all the facts about one field in one bundle, and likewise for one segment:

```text
def FieldWF (f : Field) : Prop :=
  f ≠ [] ∧ ∀ r ∈ f, r ≠ [] ∧ ∀ c ∈ r, c ≠ [] ∧ ∀ s ∈ c, segmentTerminator ∉ s

structure SegmentWF (s : Segment) : Prop where
  id_length : s.id.length = 3
  id_no_terminator : segmentTerminator ∉ s.id
  fields : ∀ f ∈ s.fields, FieldWF f
```

| Theorem              | Statement                              | In words                                            |
| -------------------- | -------------------------------------- | --------------------------------------------------- |
| `Message.WF.field`   | `m.WF → f ∈ m.fields → FieldWF f`      | In a well-formed message, each field is well formed |
| `Message.WF.header`  | `m.WF → ∀ f ∈ m.header, FieldWF f`     | …each MSH field from MSH-3 on is well formed        |
| `Message.WF.segment` | `m.WF → ∀ s ∈ m.segments, SegmentWF s` | …each segment after MSH is well formed              |

**A proof of "for every" is a function.** These proofs have no `by`; the proof is written directly as a value, which is called **term mode**. A proof of `∀ x ∈ list, P x` is a function: give it an `x` and a proof that `x` is in the list, and it gives you a proof of `P x`.

```lean
example (P : Nat → Prop) (h : ∀ n ∈ [1, 2, 3], P n) : P 2 := h 2 (by decide)
```

Reading `Message.WF.field`, with the first line simplified:

```text
theorem Message.WF.field (hm : m.WF) (hf : f ∈ m.fields) : FieldWF f :=
  ⟨hm.field_has_repetition f hf,                         -- f ≠ []
   fun r hr =>                                            -- for every repetition r in f:
    ⟨hm.repetition_has_component f hf r hr,              --   r ≠ []
     fun c hc =>                                          --   for every component c in r:
      ⟨hm.component_has_subcomponent f hf r hr c hc,     --     c ≠ []
       hm.subcomponent_no_terminator f hf r hr c hc⟩⟩⟩    --     no subcomponent of c holds \r
```

It takes each of the four field rules from `hm` and calls it on this field, its repetitions and its components: unpack and repack again, going down through the levels.

- **`header`:** a field in `m.header` is also in `m.fields`, because `m.fields` is `header ++ …` (`List.mem_append_left`). So `hm.field` applies.
- **`segment`:** builds the three slots of `SegmentWF` from the two segment-ID rules, plus `hm.field` for each field (`List.mem_append_right`, `List.mem_flatMap`).

**The `_root_.Hl7v2.Spec.Message.WF.` prefix** puts the theorem in `Message.WF`'s namespace, so it can be called with a dot: `hm.field` instead of `Message.WF.field hm`. In `Thm/Encoding/Decode.lean`, `decode_encode` starts with `have hh := hm.header` and `have hs := hm.segment`.

They're lemmas: they regroup the rules and add nothing, so they only have to build.

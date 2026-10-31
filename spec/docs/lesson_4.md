# Lesson 4: One text, one meaning

This lesson reads the main theorem of the specification, `encode_injective`, in `Hl7v2/Thm/Encoding.lean`:

```lean
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]
```

The proof is one line. To read it you need one new tactic, `rw`, and one idea, the decoder trick. We build both on small examples first, in seven steps.

Create `Hl7v2/Lesson4.lean`, start it with these lines, and paste each example below them:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm

def good : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["1".toList]]], [[["Smith".toList], ["John".toList]]]]⟩]⟩
def oneSegment : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a\rPV1".toList]]]]⟩]⟩
def twoSegments : Message :=
  ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a".toList]]]]⟩, ⟨"PV1".toList, []⟩]⟩
```

Every example in this lesson builds without errors.

## Step 1: What the theorem claims

Read the statement in English:

> For any two messages `m₁` and `m₂`, if both are well formed, and both are written as the same text, then they are the same message.

So a well-formed text has exactly **one** meaning. A receiver that reads `MSH|^~\&␍PID|1|Smith^John␍` can only arrive at one message, because no other well-formed message is written that way.

Mathematicians call a function with this property **injective**: different inputs always give different outputs. Many functions are not. `length` is not injective, because two different segment IDs have the same length:

```lean
#eval "PID".length == "PV1".length   -- true
```

From the length alone, you cannot tell which ID it was. `encode_injective` says that from the text alone, you _can_ always tell which message it was.

## Step 2: Why it needs "well formed"

You saw this in lesson 2: without the rules, two messages share a text.

```lean
#eval encode oneSegment == encode twoSegments   -- true: both are MSH|^~\&␍PID|a␍PV1␍
#eval oneSegment.failures                       -- ["well_formed_subcomponent_no_terminator"]
```

`oneSegment` breaks a rule (a segment terminator inside a value), so the theorem says nothing about it. That is why the statement asks for `h₁ : m₁.WF` and `h₂ : m₂.WF`: the claim holds only for messages that follow the rules.

## Step 3: The decoder trick

How do you prove that a function never sends two inputs to the same output? You show that the output can be **undone**: if a function `back` always recovers the input, `back (f x) = x`, then two inputs with the same output must be the same input.

A small version with numbers:

```lean
def double (n : Nat) : Nat := 2 * n
def half (n : Nat) : Nat := n / 2

theorem half_double (n : Nat) : half (double n) = n := by
  simp only [half, double]
  omega
```

`half_double` says: halving undoes doubling. (`omega` is a tactic that proves simple arithmetic.)

Now suppose `double a = double b`. Then:

```
a = half (double a)    by half_double
  = half (double b)    because double a = double b
  = b                  by half_double
```

So `double` is injective. That chain of three equalities is the whole idea. The next step shows how to write it in Lean.

## Step 4: `rw`, rewriting with an equation

`rw [e]` takes an equation `e : x = y` and replaces `x` with `y` in the goal. `rw [← e]` goes the other way: it replaces `y` with `x`.

```lean
example (a b : Nat) (h : double a = double b) : a = b := by
  rw [← half_double a]
  rw [h]
  rw [half_double b]
```

Watch the goal in the infoview after each line:

| After                  | Goal                    | What happened                                                                                   |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `by`                   | `⊢ a = b`               |                                                                                                 |
| `rw [← half_double a]` | `⊢ half (double a) = b` | `half_double a` says `half (double a) = a`; read backwards, it turns `a` into `half (double a)` |
| `rw [h]`               | `⊢ half (double b) = b` | `h` says `double a = double b`, so `double a` becomes `double b`                                |
| `rw [half_double b]`   | No goals                | `half (double b)` becomes `b`, leaving `b = b`, which `rw` closes by itself                     |

Several rewrites can go in one bracket, applied left to right:

```lean
example (a b : Nat) (h : double a = double b) : a = b := by
  rw [← half_double a, h, half_double b]
```

**Exercise.** Define `triple` and `third`, prove that `third` undoes `triple`, and prove `triple` is injective.

<details><summary>Answer</summary>

```lean
def triple (n : Nat) : Nat := 3 * n
def third (n : Nat) : Nat := n / 3

theorem third_triple (n : Nat) : third (triple n) = n := by
  simp only [third, triple]
  omega

example (a b : Nat) (h : triple a = triple b) : a = b := by
  rw [← third_triple a, h, third_triple b]
```

</details>

## Step 5: The decoder for messages

The specification does the same thing with `encode`. In `Hl7v2/Thm/Encoding/Decode.lean` there is a function `decode` that reads a message back from its text: it takes the delimiters from characters 4 to 8, splits the text into segments on `\r`, then splits each segment into fields, repetitions, components and subcomponents, and reads each subcomponent back from its escape sequences (`unescape`, in `Escape.lean` beside it).

```lean
#eval decode (encode good) == good   -- true: decoding undoes encoding
```

Use `==` with `#eval`, and `=` in theorem statements. `decode (encode good) = good` also prints `true`, but it is a different thing (lesson 2): `==` is a `Bool` computation, while `=` is a claim, a `Prop`, which `#eval` can answer only because `Message` has a `DecidableEq` instance.

The lemma that plays the role of `half_double` is:

```lean
#check @decode_encode
-- decode_encode : m.WF → decode (encode m) = m
```

"For a well-formed message, decoding its encoding gives the message back." Note the `m.WF`: decoding cannot undo encoding for `oneSegment`, because its text is the same as `twoSegments`'s, and `decode` has to pick one:

```lean
#eval decode (encode oneSegment) == oneSegment    -- false
#eval decode (encode oneSegment) == twoSegments   -- true
```

`decode` and `unescape` are **proof devices**. Their files say so: it "exists only to carry the proof of `encode_injective`: it is not part of the specification". The specification describes how a sender writes a message; it does not define a parser. They live under `Thm/`, not `Spec/`, for that reason, and nothing claims glion's parser behaves like it.

Proving `decode_encode` is the hard part: about 140 lines in `Decode.lean`, mostly facts about splitting a joined list, and 80 in `Escape.lean` for the escape sequences. It is a lemma, so it only has to build; you do not need to read it for this lesson. Once you have finished the lesson, [the lesson 4 appendix](lesson_4_appendix.md) opens it and shows how such a proof is designed.

## Step 6: The real proof

Now `encode_injective` is step 4 with `decode` in place of `half`:

```lean
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]
```

| After                | Goal                        | Same as step 4          |
| -------------------- | --------------------------- | ----------------------- |
| `by`                 | `⊢ m₁ = m₂`                 | `⊢ a = b`               |
| `← decode_encode h₁` | `⊢ decode (encode m₁) = m₂` | `⊢ half (double a) = b` |
| `h`                  | `⊢ decode (encode m₂) = m₂` | `⊢ half (double b) = b` |
| `decode_encode h₂`   | No goals                    | No goals                |

The `h₁` and `h₂` are where "well formed" is used: `decode_encode` needs a proof that the message is well formed before it will say decoding undoes encoding.

Put your cursor after each rewrite in `Hl7v2/Thm/Encoding.lean` to see these goals yourself.

## Step 7: Why distinct delimiters are a rule

The same file has a second theorem, `ambiguous_without_distinct_delimiters`. It shows that if the component separator were `|`, the same as the field separator, two different messages would share a text:

```lean
def d : Delimiters := { Delimiters.suggested with component := '|' }
def twoComponents : Message := ⟨d, [], [⟨['P', 'I', 'D'], [[[[['a']], [['b']]]]]⟩]⟩
def twoFields' : Message := ⟨d, [], [⟨['P', 'I', 'D'], [[[[['a']]]], [[[['b']]]]]⟩]⟩

#eval String.ofList (encode twoComponents)   -- "MSH||~\\&\x0dPID|a|b\x0d"
#eval encode twoComponents == encode twoFields'   -- true
```

`PID|a|b` could be one field with two components, or two fields. So `encode_injective` would be false without the rule `well_formed_delimiters_distinct`, and this theorem is the evidence that the rule is needed. HL7v2 suggests `|^~\&` but never says the delimiters must differ; the specification adds the rule and proves why.

## What you can now say

- **The claim:** every well-formed HL7v2 text has exactly one meaning.
- **The method:** build a decoder, prove it undoes the encoding, and rewrite three times.
- **Where the rules matter:** `decode_encode` needs them, and `ambiguous_without_distinct_delimiters` shows that dropping one breaks the claim.
- **What it does not say:** anything about glion's parser. Connecting the specification to glion is the next stage: checking glion against the specification on many generated messages.

**Final exercise.** In `Hl7v2/Thm/Encoding.lean`, delete `(h₂ : m₂.WF)` from the statement and rebuild. Read the error: which rewrite fails, and why? Then undo it.

<details><summary>Answer</summary>

The last rewrite, `decode_encode h₂`, fails because `h₂` no longer exists. Without a proof that `m₂` is well formed, nothing says that decoding `encode m₂` gives back `m₂`, and the theorem would be false: `twoSegments` and `oneSegment` share a text, but only one of them is well formed.

</details>

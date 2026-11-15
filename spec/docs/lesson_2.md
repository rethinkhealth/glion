# Lesson 2: Claims and rules

Lesson 1 wrote definitions and ran them on examples. An example shows one case. This lesson states claims that Lean checks for every value, and it writes the first rule: a statement of the standard that some messages meet and others do not.

It formalizes this statement from [the list](statements.md):

| Statement                        | In this lesson                         |
| -------------------------------- | -------------------------------------- |
| `segment_id_is_three_characters` | `Message.WF.segment_id_length`, a rule |

You need lesson 1.

## Setup

Create `spec/practice/Lesson2.lean` and start it with these lines:

```lean
import Hl7v2

open Hl7v2.Spec (Delimiters Segment Message)

namespace Lesson2

def message : Message :=
  { delimiters := Delimiters.suggested,
    header := [[[["LAB".toList]]]],
    segments := [{ id := "PID".toList, fields := [[[["123".toList]]]] }, { id := "PV1".toList, fields := [] }] }
```

`open Hl7v2.Spec (…)` brings the names in the brackets into reach: the definitions of lesson 1, from the specification.

## 1. A claim is a type

`1 + 1 = 2` is a claim. In Lean a claim is a value like any other, and it has a type:

```lean
#check 1 + 1 = 2   -- 1 + 1 = 2 : Prop
```

`Prop` is the type of claims, true or false. `1 + 1 = 3` is a `Prop` too.

A claim is true when it has a **proof**. `example` asks Lean to check one:

```lean
example : 1 + 1 = 2 := rfl
```

Read it like a `def` without a name: after the `:` comes the claim, after the `:=` its proof. The proof here is `rfl`, short for reflexivity: "compute both sides; they are the same value". Lean computes `1 + 1`, gets `2`, and accepts.

A false claim has no proof. Lean rejects this one (do not paste):

```lean skip
example : 1 + 1 = 3 := rfl
```

```text
error: Type mismatch
  rfl
has type
  ?m.16 = ?m.16
but is expected to have type
  1 + 1 = 3
```

`rfl` proves claims of the form `x = x`, and after computing, `2 = 3` is not of that form.

This is the difference from `#eval`. `#eval` prints a value and you compare it with what you expected. An `example` states what you expect, and Lean refuses the file if it does not hold.

## 2. A claim about one value

> This field contains five characters in the following order: the component separator, repetition separator, escape character, subcomponent separator, and truncation character. (§2.14.9.2)

Lesson 1 defined `encodingCharacters` as the first four of them; the specification does not model the truncation character. For the suggested delimiters, as a claim:

```lean
example : Delimiters.suggested.encodingCharacters = "^~\\&".toList := rfl
```

Lean computes the encoding characters of `Delimiters.suggested` and finds the four characters of `^~\&`. In a Lean string a backslash is written twice.

There is a second way to prove a claim like this one. `decide` asks Lean to decide whether the claim is true by running a procedure for it:

```lean
example : Delimiters.suggested.encodingCharacters = "^~\\&".toList := by decide
```

`by` starts a proof written as instructions, called tactics; `decide` is one. For an equality of two computed lists, `rfl` and `decide` do the same work. `decide` goes further: it also proves claims that are not equalities, and section 5 needs that.

## 3. A claim about every value

The standard does not speak of one set of delimiters: MSH-2 holds the same number of characters whatever they are. A claim about every `Delimiters` takes one as an input:

```lean
example (d : Delimiters) : d.encodingCharacters.length = 4 := rfl
```

`d` is any `Delimiters`. Nothing is known about it: not one of its five characters. And `rfl` still proves the claim. Lean computes with `d` as an unknown: `d.encodingCharacters` is `[d.component, d.repetition, d.escape, d.subcomponent]` by its definition, a list of four elements whatever they are.

That is a proof for every set of delimiters at once, and no amount of `#eval` could give it.

Compare with a claim that looks the same and is false (do not paste):

```lean skip
example (d : Delimiters) : d.encodingCharacters = "^~\\&".toList := rfl
```

```text
error: Type mismatch
  rfl
has type
  ?m.3 = ?m.3
but is expected to have type
  d.encodingCharacters = "^~\\&".toList
```

The first encoding character is `d.component`, which is `^` only for some delimiters. The claim holds for `Delimiters.suggested` and fails for a message that declares `*`. Lean cannot prove it, and it should not.

## 4. Theorems

A `theorem` is a claim with a name and a proof. Once proved, the name can be used wherever the fact is needed.

```lean
theorem encodingCharacters_length (d : Delimiters) : d.encodingCharacters.length = 4 := rfl

example : message.delimiters.encodingCharacters.length = 4 :=
  encodingCharacters_length message.delimiters
```

A theorem is named after what it concludes, in lower case with underscores. The `example` proves a claim about one message by applying the theorem to its delimiters: a theorem about every `Delimiters` is a function from a `Delimiters` to a proof.

`#check` prints the statement of a theorem:

```lean
#check @encodingCharacters_length   -- @encodingCharacters_length : ∀ (d : Delimiters), d.encodingCharacters.length = 4
```

`∀ (d : Delimiters), …` reads "for every `d`, …". An input written before the `:` and a `∀` after it are the same thing.

## 5. A rule

> Each segment is identified by a unique three-character code known as the Segment ID. (§2.5.2)

Lesson 1 ended on a segment whose ID has two characters. The type allows it; the standard does not. This statement cannot be a theorem about every message, because it is false for some values of `Message`. It is a **rule**: a claim about a message, true of some and false of others.

For a message `m`, the rule is the claim `∀ s ∈ m.segments, s.id.length = 3`. It reads "for every `s` that is an element of `m.segments`, the ID of `s` has length 3". `∀` is "for every" and `∈` is "is an element of".

For a given message, the claim is true or false, and `decide` finds out which:

```lean
example : ∀ s ∈ message.segments, s.id.length = 3 := by decide

def shortId : Message := { message with segments := [{ id := "PI".toList, fields := [] }] }

example : ¬ ∀ s ∈ shortId.segments, s.id.length = 3 := by decide
```

`{ message with segments := … }` is `message` with one field replaced. `¬` is "not". The second example is a proof that `shortId` breaks the rule. `rfl` could prove neither: they are not equalities. `decide` works because the claim can be checked by a procedure: go through the segments, compare each length with 3.

Ask `decide` to prove a false claim and it says so (do not paste):

```lean skip
example : ∀ s ∈ shortId.segments, s.id.length = 3 := by decide
```

```text
error: Tactic `decide` proved that the proposition
  ∀ (s : Segment), s ∈ shortId.segments → s.id.length = 3
is false
```

The error shows the claim as Lean holds it: `∀ s ∈ l, P s` is short for `∀ s, s ∈ l → P s`, "for every `s`, if `s` is in `l` then `P s`". `→` is "if … then".

## 6. The rules of a message

The specification will have several rules. It collects them in one structure, `Message.WF`, for "well formed". A structure whose fields are claims is itself a claim: it holds when every field does.

```lean
structure WF (m : Message) : Prop where
  segment_id_length : ∀ s ∈ m.segments, s.id.length = 3
```

A proof of `WF m` is a proof of each rule, built like any structure value:

```lean
example : WF message := { segment_id_length := by decide }
```

And from a proof of `WF m`, each rule can be read back, like any field:

```lean
example (m : Message) (h : WF m) (s : Segment) (hs : s ∈ m.segments) : s.id.length = 3 :=
  h.segment_id_length s hs
```

Read the inputs: `m` is any message, `h` is a proof that `m` is well formed, `s` is any segment, and `hs` is a proof that `s` is one of `m`'s segments. A proof is a value, so it can be an input. The conclusion follows by taking the rule out of `h` and applying it to `s` and `hs`.

This is how a rule will be used from here on: a theorem that holds only for well-formed messages takes a proof of `WF m` as an input.

`WF` has one rule today. A rule enters it in one of two ways: the standard states it, as here, or a proof needs it.

## 7. A rule is not the type

Why not make a two-character ID impossible, with a type that holds exactly three characters? Because the specification must be able to talk about messages that break a rule: to say which rule a message breaks, and to prove what goes wrong without the rule. `shortId` is a value Lean can reason about, and section 5 proved a fact about it.

So the specification keeps two layers apart:

| Layer                       | Says                       | Lesson |
| --------------------------- | -------------------------- | ------ |
| Types: `Message`, `Segment` | what a message is made of  | 1      |
| Rules: `Message.WF`         | which messages are allowed | 2      |

## 8. The same, in the specification

The rule is in `Hl7v2/Spec/WellFormed.lean`, as `Hl7v2.Spec.Message.WF`. Read it out of a proof that a message is well formed, as in section 6:

```lean
example (m : Message) (h : m.WF) (s : Segment) (hs : s ∈ m.segments) : s.id.length = 3 :=
  h.segment_id_length s hs

end Lesson2
```

`m.WF` is `Message.WF m`: the specification's structure, not the `WF` of your file.

## What you can now say

About HL7v2:

- `encodingCharacters` is four characters for every message, and that is proved.
- A Segment ID of three characters is a rule: some values of `Message` meet it and some do not.

About Lean:

- A claim is a value of type `Prop`. A proof of it is a value too, and can be an input.
- `example` checks a proof; `theorem` names it.
- `rfl` proves an equality by computing both sides, also when an input is unknown. `decide` proves any claim Lean can check by a procedure.
- A claim with an input, `(d : Delimiters)`, is a claim about every `Delimiters`.
- A rule is a claim about a message, true of some messages and false of others. `Message.WF` is the structure of the rules.

## Exercises

**1. A claim about every value.** State and prove: the first encoding character of every `Delimiters` is its component separator. `take 1` keeps the first element of a list.

<details><summary>Answer</summary>

```lean
example (d : Delimiters) : d.encodingCharacters.take 1 = [d.component] := rfl
```

</details>

**2. True for one, false for all.** `d.field = '|'` is not provable for every `d`. Prove that it is false for some `Delimiters`: build one and prove the negation with `decide`.

<details><summary>Answer</summary>

```lean
def hashDelimiters : Delimiters := { Delimiters.suggested with field := '#' }

example : ¬ hashDelimiters.field = '|' := by decide
```

A claim about every value is refuted by one value.

</details>

**3. A rule of your own.** The standard says a message starts with MSH, so no later segment should be MSH. Write that as a claim about `message`, and prove it.

<details><summary>Answer</summary>

```lean
example : ∀ s ∈ Lesson2.message.segments, s.id ≠ "MSH".toList := by decide
```

Whether this belongs in `Message.WF` is a different question: a rule needs a source, a sentence of the standard or a proof that needs it. The statements list has no such sentence yet.

</details>

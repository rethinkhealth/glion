# Lesson 3: Claims and rules

Lessons 1 and 2 wrote definitions and ran them on examples. An example shows one case. This lesson states claims that Lean checks for every message, and it writes the first rule: a statement of the standard that some messages meet and others do not.

It formalizes these statements from [the list](statements.md):

| Statement                        | In this lesson                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `segment_starts_with_its_id`     | `encode_starts_with_msh`, a theorem                                                 |
| `delimiters_declared_in_msh`     | `field_separator_is_fourth_character`, `encoding_characters_follow_field_separator` |
| `segment_id_is_three_characters` | `Message.WF.segment_id_length`, a rule                                              |

You need lessons 1 and 2.

## Setup

Create `spec/practice/Lesson3.lean` and start it with these lines:

```lean
import Hl7v2

open Hl7v2.Spec

namespace Lesson3

def message : Message :=
  { delimiters := Delimiters.suggested,
    header := [[[["LAB".toList]]]],
    segments := [{ id := "PID".toList, fields := [[[["123".toList]]]] }, { id := "PV1".toList, fields := [] }] }

#eval String.ofList (encode message)   -- "MSH|^~\\&|LAB\x0dPID|123\x0dPV1\x0d"
```

`open Hl7v2.Spec` with no brackets brings in every definition of lessons 1 and 2.

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

## 2. A claim about one message

> …with the field delimiter in the 4th character position (§2.5.4)

For the message above, as a claim. `drop 3` removes the first three characters of a list, and `take 1` keeps the first one of what is left:

```lean
example : ((encode message).drop 3).take 1 = ['|'] := rfl
```

Lean computes the text of `message`, drops three characters, takes one, and finds `['|']`.

There is a second way to prove a claim like this one. `decide` asks Lean to decide whether the claim is true by running a procedure for it:

```lean
example : ((encode message).drop 3).take 1 = ['|'] := by decide
```

`by` starts a proof written as instructions, called tactics; `decide` is one. For an equality of two computed lists, `rfl` and `decide` do the same work. `decide` goes further: it also proves claims that are not equalities, and section 5 needs that.

## 3. A claim about every message

The standard does not speak of one message. It says the field separator is the 4th character of every message. A claim about every message takes the message as an input:

```lean
example (m : Message) : ((encode m).drop 3).take 1 = [m.delimiters.field] := rfl
```

`m` is any message. Nothing is known about it: not its delimiters, not its segments. And `rfl` still proves the claim. Lean computes with `m` as an unknown: `encode m` starts with `encodeHeader m.delimiters m.header`, which is `'M' :: 'S' :: 'H' :: m.delimiters.field :: …`. Dropping three characters and taking one leaves `[m.delimiters.field]`, whatever `m.delimiters.field` is.

That is a proof for every message at once, and no amount of `#eval` could give it.

Compare with a claim that looks the same and is false (do not paste):

```lean skip
example (m : Message) : (encode m).take 4 = "MSH|".toList := rfl
```

```text
error: Type mismatch
  rfl
has type
  ?m.6 = ?m.6
but is expected to have type
  List.take 4 (encode m) = "MSH|".toList
```

The 4th character is `m.delimiters.field`, which is `|` only for some messages. The claim holds for `message` and fails for a message that declares `#`. Lean cannot prove it, and it should not.

## 4. Theorems

A `theorem` is a claim with a name and a proof. Once proved, the name can be used wherever the fact is needed.

```lean
theorem encode_starts_with_msh (m : Message) : (encode m).take 3 = mshId := rfl

theorem field_separator_is_fourth_character (m : Message) :
    ((encode m).drop 3).take 1 = [m.delimiters.field] := rfl

theorem encoding_characters_follow_field_separator (m : Message) :
    ((encode m).drop 4).take 4 = m.delimiters.encodingCharacters := rfl
```

A theorem is named after what it concludes, in lower case with underscores.

These three formalize statements about the text. In lesson 2, `delimiters_declared_in_msh` was formalized by a definition: `encodeHeader` writes the delimiters in that place. Here it is formalized a second time, as a theorem about the text of every message. The two are different kinds of evidence. The definition is what the sender does; the theorem is a fact that follows, and it would fail to build if a later change to `encode` moved the delimiters.

`#check` prints the statement of a theorem:

```lean
#check @encode_starts_with_msh   -- encode_starts_with_msh : ∀ (m : Message), List.take 3 (encode m) = mshId
```

`∀ (m : Message), …` reads "for every message `m`, …". An input written before the `:` and a `∀` after it are the same thing.

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

`¬` is "not". The second example is a proof that `shortId` breaks the rule. `rfl` could prove neither: they are not equalities. `decide` works because the claim can be checked by a procedure: go through the segments, compare each length with 3.

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

`WF` has one rule today. A rule enters it in one of two ways: the standard states it, as here, or a proof needs it. Lesson 4 meets the second kind.

## 7. A rule is not the type

Why not make a two-character ID impossible, with a type that holds exactly three characters? Because the specification must be able to talk about messages that break a rule: to say which rule a message breaks, and to prove what goes wrong without the rule. `shortId` is a value Lean can reason about, and section 5 proved a fact about it.

So the specification keeps two layers apart:

| Layer                       | Says                       | Lesson |
| --------------------------- | -------------------------- | ------ |
| Types: `Message`, `Segment` | what a message is made of  | 1      |
| Rules: `Message.WF`         | which messages are allowed | 3      |

## 8. The same, in the specification

The theorems are in `Hl7v2/Thm/Encoding.lean`, in the namespace `Hl7v2.Thm`, and the rule is in `Hl7v2/Spec/WellFormed.lean`. Definitions and rules are under `Spec`, theorems under `Thm`: what the specification says, and what follows from it.

Use them by name:

```lean
example : (encode message).take 3 = mshId := Hl7v2.Thm.encode_starts_with_msh message

example (m : Message) (h : m.WF) (s : Segment) (hs : s ∈ m.segments) : s.id.length = 3 :=
  h.segment_id_length s hs

end Lesson3
```

The first line proves a claim about `message` by applying the theorem to it: a theorem about every message is a function from a message to a proof. The second reads the rule out of a proof that a message is well formed, as in section 6, with the specification's `Message.WF`.

## What you can now say

About HL7v2:

- Every message starts with `MSH`, its 4th character is its field separator, and its encoding characters follow. These hold for every message, and they are proved.
- A Segment ID of three characters is a rule: some values of `Message` meet it and some do not.

About Lean:

- A claim is a value of type `Prop`. A proof of it is a value too, and can be an input.
- `example` checks a proof; `theorem` names it.
- `rfl` proves an equality by computing both sides, also when an input is unknown. `decide` proves any claim Lean can check by a procedure.
- A claim with an input, `(m : Message)`, is a claim about every message.
- A rule is a claim about a message, true of some messages and false of others. `Message.WF` is the structure of the rules.

## Exercises

**1. A claim about every message.** State and prove: the first eight characters of the text of every message are `MSH`, the field separator, and the encoding characters.

<details><summary>Answer</summary>

```lean
example (m : Message) :
    (encode m).take 8 = mshId ++ m.delimiters.field :: m.delimiters.encodingCharacters := rfl
```

</details>

**2. True for one, false for all.** Section 3 showed that `(encode m).take 4 = "MSH|".toList` is not provable for every `m`. Prove that it is false for some message: build one and prove the negation with `decide`.

<details><summary>Answer</summary>

```lean
def hashMessage : Message :=
  { delimiters := { Delimiters.suggested with field := '#' }, header := [], segments := [] }

example : ¬ (encode hashMessage).take 4 = "MSH|".toList := by decide
```

A claim about every message is refuted by one message.

</details>

**3. Break a theorem.** In lesson 2's practice file you had your own `encodeHeader`. Suppose it wrote the encoding characters before the field separator. Which of the three theorems of section 4 would still be proved by `rfl`?

<details><summary>Answer</summary>

Only `encode_starts_with_msh`. The 4th character would be the component separator, and the four characters after it would be `~\&` and the field separator, so the other two would fail with a type mismatch. That is what the theorems are for: a change to the writer that breaks a statement of the standard does not build.

</details>

**4. A rule of your own.** The standard says a message starts with MSH, so no later segment should be MSH. Write that as a claim about `message`, and prove it.

<details><summary>Answer</summary>

```lean
example : ∀ s ∈ Lesson3.message.segments, s.id ≠ mshId := by decide
```

Whether this belongs in `Message.WF` is a different question: a rule needs a source, a sentence of the standard or a proof that needs it. The statements list has no such sentence yet.

</details>

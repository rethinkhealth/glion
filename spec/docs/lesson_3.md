# Lesson 3: A text represents a message

Lesson 1 said what a message is: delimiters, fields, segments. What two systems exchange is text. This lesson says when a text is the text of a message. It does not say who writes the text or who reads it: it states a relation between the two, and every later lesson is a claim about that relation.

It formalizes these statements from [the list](statements.md):

| Statement                                                                   | In this lesson         |
| --------------------------------------------------------------------------- | ---------------------- |
| `subcomponent_separator_separates_subcomponents`, `subcomponents_joined`    | `RepresentsComponent`  |
| `component_separator_separates_components`, `components_joined`             | `RepresentsRepetition` |
| `repetition_separator_separates_occurrences`, `repetitions_joined`          | `RepresentsField`      |
| `field_separator_after_segment_id`, `field_separator_before_each_field`     | `RepresentsFields`     |
| `segment_starts_with_its_id`                                                | `RepresentsSegment`    |
| `segment_terminator_terminates_segment`, `segment_terminator_after_segment` | `RepresentsSegments`   |
| `delimiters_declared_in_msh`                                                | `Represents`           |

You need lessons 1 and 2.

## Setup

Create `spec/practice/Lesson3.lean` and start it with these lines:

```lean
import Hl7v2

open Hl7v2.Spec (Delimiters Component Repetition Field Segment Message segmentTerminator)

namespace Lesson3

def d : Delimiters := Delimiters.suggested
```

The definitions of this lesson are yours, in the namespace `Lesson3`. `d` is a short name for the suggested delimiters.

## 1. A relation

Figure 2-1 of the standard says what each delimiter does (§2.5.4):

> Segment Terminator: Terminates a segment record.
>
> Field Separator: Separates two adjacent data fields within a segment. It also separates the segment ID from the first data field in each segment.
>
> Component Separator: Separates adjacent components of data fields where allowed.
>
> Repetition Separator: Separates multiple occurrences of a field where allowed.
>
> Subcomponent Separator: Separates adjacent subcomponents of data fields where allowed.

These sentences describe a text. They do not say "to write a message, do this" or "to read a text, do that". They say what is true of a text and a message when the text is a text of that message.

So the specification starts from a claim with two inputs: "the text `t` represents the message `m`". Lesson 2 wrote claims with one input, such as `d.encodingCharacters.length = 4`. A claim with two inputs is called a **relation**. It is a function that returns a `Prop`:

```lean
def SameLength (t : List Char) (u : List Char) : Prop := t.length = u.length

#check SameLength   -- Lesson3.SameLength (t u : List Char) : Prop

example : SameLength "PID".toList "MSH".toList := rfl
```

`SameLength "PID".toList "MSH".toList` is the claim `"PID".toList.length = "MSH".toList.length`, and `rfl` proves it. A relation holds for some pairs and not for others, as a rule holds for some messages and not for others.

A relation does not choose a direction. One text may be related to several messages, or one message to several texts. Whether that happens is a claim to prove, and lessons 4 and 5 prove two of them.

## 2. Separated

Four of the five sentences have one shape: items, with a separator between two adjacent items. Write that shape once, for any kind of item.

The shape is defined by cases:

- No item: the text is empty.
- One item: the text is a text of that item.
- A first item and more after it: the text is a text of the first item, then the separator, then a text of the others.

In Lean, a claim defined by cases is an `inductive`:

```lean
inductive Separated {α : Type} (sep : Char) (R : List Char → α → Prop) : List Char → List α → Prop
  | nil : Separated sep R [] []
  | one {t : List Char} {a : α} : R t a → Separated sep R t [a]
  | cons {t ts : List Char} {a b : α} {as : List α} :
      R t a → Separated sep R ts (b :: as) → Separated sep R (t ++ sep :: ts) (a :: b :: as)
```

Read the first line. `α` is the type of the items; the braces mean Lean finds it from the other inputs. `sep` is the separator. `R` is a relation between a text and one item: `R t a` says "`t` is a text of the item `a`". After the `:`, `List Char → List α → Prop` says `Separated sep R` is a relation between a text and a list of items.

Each line that starts with `|` is one case, and each case is a way to prove the claim. Nothing else proves it.

- `nil` proves `Separated sep R [] []`: the empty text, for no item.
- `one` takes a proof of `R t a` and proves `Separated sep R t [a]`.
- `cons` takes a proof of `R t a` and a proof that `ts` is a text of the items `b :: as`, and proves that `t ++ sep :: ts` is a text of `a :: b :: as`. `b :: as` is a list with at least one item, `b`.

`→` between claims reads "if … then": `one` says "if `R t a`, then `Separated sep R t [a]`". A case is a function from proofs to a proof.

Try it with the simplest `R`: an item is a list of characters, and its text is itself.

```lean
example : Separated '&' (fun t s => t = s) "HOSP".toList ["HOSP".toList] :=
  .one rfl
```

`.one` is `Separated.one`; Lean knows which `one` from the claim. It needs a proof of `R t a`, which here is `"HOSP".toList = "HOSP".toList`, and `rfl` proves it.

Two items:

```lean
example : Separated '&' (fun t s => t = s)
    ("HOSP".toList ++ '&' :: "1.2.3".toList) ["HOSP".toList, "1.2.3".toList] :=
  .cons rfl (.one rfl)
```

`.cons` takes two proofs: `rfl` for the first item, and `.one rfl` for the items after it. The text is written as `"HOSP".toList ++ '&' :: "1.2.3".toList` so that Lean sees the three parts of the `cons` case: `t`, `sep` and `ts`.

Written as one string, Lean cannot find where the first item ends, and it must be told:

```lean
example : Separated '&' (fun t s => t = s) "HOSP&1.2.3".toList ["HOSP".toList, "1.2.3".toList] :=
  .cons (t := "HOSP".toList) rfl (.one rfl)
```

`(t := "HOSP".toList)` gives the input `t` of `cons` by name. Lean then computes that `"HOSP".toList ++ '&' :: "1.2.3".toList` and `"HOSP&1.2.3".toList` are the same list.

Why three cases and not two? With only "no item" and "an item, the separator, the others", the text of one item would end with the separator. The sentences of Figure 2-1 say "separates adjacent": a separator stands between two items.

## 3. A component, a repetition, a field

A component is its subcomponents, and a subcomponent is written as its own characters:

```lean
def RepresentsComponent (d : Delimiters) (text : List Char) (c : Component) : Prop :=
  Separated d.subcomponent (fun t s => t = s) text c

example : RepresentsComponent d "HOSP&1.2.3".toList ["HOSP".toList, "1.2.3".toList] :=
  .cons (t := "HOSP".toList) rfl (.one rfl)
```

The proof is the one of section 2: `RepresentsComponent d …` is, by its definition, a `Separated` claim.

A repetition is its components. The relation for one item is now `RepresentsComponent d`, the relation just defined, with its first input given:

```lean
def RepresentsRepetition (d : Delimiters) (text : List Char) (r : Repetition) : Prop :=
  Separated d.component (RepresentsComponent d) text r

example : RepresentsRepetition d "SMITH^JOHN".toList [["SMITH".toList], ["JOHN".toList]] :=
  .cons (t := "SMITH".toList) (.one rfl) (.one (.one rfl))
```

Read the proof from the outside. `.cons` splits the text at `^`. Its first proof must show that `SMITH` represents the component `["SMITH".toList]`: one subcomponent, so `.one rfl`. Its second must show that `JOHN` represents the list of one component `[["JOHN".toList]]`: `.one` for the list of components, and inside it `.one rfl` for the component.

A field is its occurrences, in the same way:

```lean
def RepresentsField (d : Delimiters) (text : List Char) (f : Field) : Prop :=
  Separated d.repetition (RepresentsRepetition d) text f

theorem field_123 : RepresentsField d "123".toList [[["123".toList]]] :=
  .one (.one (.one rfl))
```

One occurrence, of one component, of one subcomponent: three times `.one`. The proof has a name because section 5 uses it.

## 4. One after another

The fifth sentence is different. The field separator "also separates the segment ID from the first data field": it stands before every field, the first one too. And the segment terminator "terminates" a segment: it stands after every segment, the last one too.

Both are items written one after another, with nothing between them, where the text of one item carries its own separator. That is a second shape, with two cases:

```lean
inductive Concatenated {α : Type} (R : List Char → α → Prop) : List Char → List α → Prop
  | nil : Concatenated R [] []
  | cons {t ts : List Char} {a : α} {as : List α} :
      R t a → Concatenated R ts as → Concatenated R (t ++ ts) (a :: as)
```

The fields of a segment are concatenated, and the text of one field is the field separator, then a text of the field. "There is a text `u` such that …" is written `∃ u, …`:

```lean
def RepresentsFields (d : Delimiters) (text : List Char) (fields : List Field) : Prop :=
  Concatenated (fun t f => ∃ u, t = d.field :: u ∧ RepresentsField d u f) text fields
```

Read the relation for one field: "there is a `u` such that `t` is the field separator followed by `u`, and `u` represents `f`". `∃` is "there is" and `∧` is "and".

A proof of `∃ u, P u` is a value for `u` together with a proof of `P u`, written `⟨u, proof⟩`. A proof of `A ∧ B` is a proof of each, written `⟨proofA, proofB⟩`. Lean lets the two be written in one pair of brackets:

```lean
example : ∃ u, "|123".toList = '|' :: u ∧ u.length = 3 :=
  ⟨"123".toList, rfl, rfl⟩
```

Now two fields, the second with no occurrence:

```lean
example : RepresentsFields d "|123|".toList [[[["123".toList]]], []] :=
  .cons (t := "|123".toList) ⟨"123".toList, rfl, field_123⟩
    (.cons (t := "|".toList) ⟨[], rfl, .nil⟩ .nil)
```

The first `.cons` takes `|123` for the first field: `u` is `123`, `rfl` proves `"|123".toList = '|' :: "123".toList`, and `field_123` proves that `123` represents the field. The second takes `|` for the second field: `u` is the empty text, and `.nil` proves that the empty text represents a field with no occurrence. The last `.nil` is for the fields after it: none.

## 5. A segment, and the segments

A segment is its Segment ID, then its fields:

```lean
def RepresentsSegment (d : Delimiters) (text : List Char) (s : Segment) : Prop :=
  ∃ u, text = s.id ++ u ∧ RepresentsFields d u s.fields

def pid : Segment := { id := "PID".toList, fields := [[[["123".toList]]]] }

theorem segment_pid : RepresentsSegment d "PID|123".toList pid :=
  ⟨"|123".toList, rfl, .cons (t := "|123".toList) ⟨"123".toList, rfl, field_123⟩ .nil⟩
```

The segments after MSH are concatenated, and the text of one is a text of the segment, then the segment terminator:

```lean
def RepresentsSegments (d : Delimiters) (text : List Char) (segments : List Segment) : Prop :=
  Concatenated (fun t s => ∃ u, t = u ++ [segmentTerminator] ∧ RepresentsSegment d u s) text segments
```

## 6. A message

> The other delimiters are defined in the MSH segment, with the field delimiter in the 4th character position, and the other delimiters occurring as in the field called Encoding Characters, which is the first field after the segment ID. (§2.5.4)

The text of a message is `MSH`, the field separator, the encoding characters, the fields of MSH from MSH-3 on, the segment terminator, and then the other segments:

```lean
def mshId : List Char := ['M', 'S', 'H']

def Represents (text : List Char) (m : Message) : Prop :=
  ∃ header segments,
    text = mshId ++ m.delimiters.field :: m.delimiters.encodingCharacters ++ header
        ++ segmentTerminator :: segments ∧
      RepresentsFields m.delimiters header m.header ∧
      RepresentsSegments m.delimiters segments m.segments
```

"There are two texts, `header` and `segments`, such that the text is these pieces in this order, `header` represents the fields of MSH, and `segments` represents the other segments." Every level takes its separators from `m.delimiters`: one set for the whole message.

This is why lesson 1 kept the delimiters apart from the other fields of MSH. MSH-1 is the field separator itself, and MSH-2 is written with no separators inside: both are the delimiters, written out.

A message and a text of it. In a Lean string `\r` is the carriage return:

```lean
def message : Message :=
  { delimiters := Delimiters.suggested, header := [], segments := [pid] }

example : Represents "MSH|^~\\&\rPID|123\r".toList message :=
  ⟨[], "PID|123\r".toList, rfl, .nil,
    .cons (t := "PID|123\r".toList) ⟨"PID|123".toList, rfl, segment_pid⟩ .nil⟩
```

Read the five parts of the proof against the definition:

1. `[]` is `header`: MSH has no field after MSH-2.
2. `"PID|123\r".toList` is `segments`.
3. `rfl` proves the equation: Lean computes `mshId ++ '|' :: … ++ '\r' :: …` and finds the text.
4. `.nil` proves that the empty text represents no field.
5. The last part proves that `PID|123␍` represents the list of one segment: `.cons` takes it all for the first segment, `PID|123` is the `u` before the terminator, and `segment_pid` is the proof of section 5.

## 7. What the relation does not say

The relation says which pairs of a text and a message go together, and no more. Three things it leaves open, each a claim:

- **Does every message have a text?** The proof above found one for `message`, by hand. Nothing yet says there is one for every message, or how to find it.
- **Can a message have two texts?**
- **Can a text represent two messages?**

There is also a practical limit. The proof above gave Lean each piece of the text. Nothing computes: `#eval` cannot print "the text of `message`", because the relation is a claim and not a function, and `decide` cannot find the pieces on its own.

Lesson 4 writes a function from a message to a text, the sender, and settles the first two questions. Lesson 5 takes the third.

## 8. The same, in the specification

`Hl7v2/Spec/Represents.lean` holds these definitions, each with the statements it formalizes. The proof of section 6 proves the specification's claim unchanged:

```lean
example : Hl7v2.Spec.Represents "MSH|^~\\&\rPID|123\r".toList message :=
  ⟨[], "PID|123\r".toList, rfl, .nil,
    .cons (t := "PID|123\r".toList)
      ⟨"PID|123".toList, rfl, "|123".toList, rfl,
        .cons (t := "|123".toList) ⟨"123".toList, rfl, .one (.one (.one rfl))⟩ .nil⟩
      .nil⟩

end Lesson3
```

Here the proofs for the segment and the field are written in place, since `segment_pid` and `field_123` prove your relations and not the specification's. `.cons`, `.one` and `.nil` are found from the claim, so the same words build a proof of either.

## What you can now say

About HL7v2:

- "This text represents this message" is a relation. The standard's sentences about separators describe it without saying who writes or who reads.
- Subcomponents, components and occurrences have their separator between two adjacent items. A field has the field separator before it, and a segment has the segment terminator after it.
- The text of a message starts with `MSH`, the field separator and the encoding characters.

About Lean:

- A relation is a function that returns a `Prop`.
- An `inductive` claim is defined by cases. Each case is a way to prove it, and a function from proofs to a proof.
- `∃ u, P u` is "there is a `u` with `P u`", and its proof is `⟨u, proof⟩`. `A ∧ B` is "`A` and `B`", and its proof is `⟨proofA, proofB⟩`.
- `(t := …)` gives an input by name when Lean cannot find it.

## Exercises

The exercises come after `end Lesson3`, so they use the specification's relations by their full names.

**1. Three subcomponents.** Prove that `a&b&c` represents the component of three subcomponents `a`, `b`, `c`.

<details><summary>Answer</summary>

```lean
example : Hl7v2.Spec.RepresentsComponent Delimiters.suggested "a&b&c".toList ["a".toList, "b".toList, "c".toList] :=
  .cons (t := "a".toList) rfl (.cons (t := "b".toList) rfl (.one rfl))
```

</details>

**2. Read a proof.** Which field does this prove a text for, and what is the text?

```lean
example : Hl7v2.Spec.RepresentsField Delimiters.suggested "1~2".toList [[["1".toList]], [["2".toList]]] :=
  .cons (t := "1".toList) (.one (.one rfl)) (.one (.one (.one rfl)))
```

<details><summary>Answer</summary>

A field of two occurrences, each of one component of one subcomponent: `1~2`. The `.cons` splits at the repetition separator. `.one (.one rfl)` is for the first occurrence: one component, one subcomponent. `.one (.one (.one rfl))` is for the list of the occurrences after it: one occurrence, one component, one subcomponent.

</details>

**3. Other delimiters.** Prove that `MSH#^~\&␍` represents a message that declares `#` as its field separator and has no field after MSH-2 and no other segment.

<details><summary>Answer</summary>

```lean
example : Hl7v2.Spec.Represents "MSH#^~\\&\r".toList
    { delimiters := { Delimiters.suggested with field := '#' }, header := [], segments := [] } :=
  ⟨[], [], rfl, .nil, .nil⟩
```

</details>

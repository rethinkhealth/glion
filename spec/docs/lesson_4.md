# Lesson 4: The sender

Lesson 3 said when a text represents a message, and left two questions: does every message have a text, and can it have two? The standard answers the first with a construction: pseudocode that a sender follows to write a message. This lesson turns it into Lean, one level at a time, until `encode` writes a whole message. Then it proves that the text `encode` writes represents the message, and that no other text does.

It formalizes these statements from [the list](statements.md):

| Statement                           | In this lesson     |
| ----------------------------------- | ------------------ |
| `subcomponents_joined`              | `encodeComponent`  |
| `components_joined`                 | `encodeRepetition` |
| `repetitions_joined`                | `encodeField`      |
| `field_separator_before_each_field` | `encodeFields`     |
| `field_separator_after_segment_id`  | `encodeFields`     |
| `segment_starts_with_its_id`        | `encodeSegment`    |
| `delimiters_declared_in_msh`        | `encodeHeader`     |
| `segment_terminator_after_segment`  | `encode`           |

And it proves these properties:

| Property                   | In this lesson                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `sender_writes_a_text`     | `encode_represents`                                                                 |
| `one_message_one_text`     | `represents_text_unique`                                                            |
| `text_declares_delimiters` | `field_separator_is_fourth_character`, `encoding_characters_follow_field_separator` |

You need lessons 1 to 3.

## Setup

Create `spec/practice/Lesson4.lean` and start it with these lines:

```lean
import Hl7v2

open Hl7v2.Spec (Delimiters Component Repetition Field Segment Message segmentTerminator)

namespace Lesson4
```

`open Hl7v2.Spec (…)` brings the names in the brackets into reach: the definitions of lesson 1, from the specification. The functions of this lesson are yours, in the namespace `Lesson4`.

## 1. The construction

§2.6.1.0 of the standard, "Message Construction Pseudocode":

```text
foreach segment in ( segment_list ) {
  insert segment.name;                    /* e.g., MSH */
  foreach field in ( fields_of( segment ) ) {
    insert field separator;               /* e.g., | */
    foreach occurrence in ( occurrences_of( field ) ) {
      construct_occurrence( occurrence );
      if not last ( populated occurrence ) insert repetition_separator;   /* e.g., ~ */
    }
    break if last ( populated field );
  }
  insert segment_terminator;              /* always<cr>! */
}

procedure construct_occurrence ( occurrence ) {
  foreach component in ( components_of( occurrence ) ) {
    foreach subcomponent in ( subcomponents_of( component ) ) {
      substitute( field_separator, \F\ );
      substitute( component_separator, \S\ );
      substitute( repetition_separator, \R\ );
      substitute( escape_character, \E\ );
      substitute( subcomponent_separator, \T\ );
      substitute( truncation_character, \P\ );
      insert subcomponent;
      if not last ( populated subcomponent ) insert subcomponent_separator;   /* e.g., & */
    }
    if not last ( populated component ) insert component_separator;   /* e.g., ^ */
  }
}
```

This lesson formalizes the lines that insert: the segment name, the separators, the subcomponent, the segment terminator. It leaves two things for later lessons, and the statements list marks both as not yet formalized:

- **The `substitute` lines.** Here, `insert subcomponent` writes the characters of the subcomponent as they are.
- **The word "populated" and the `break`.** Here, every field, repetition, component and subcomponent of the message is written.

Lesson 3 formalized the same lines as a relation: where each separator stands in a text. Here they become a procedure that produces the text.

The pseudocode is a loop that inserts text piece by piece. Lean has no loops of that kind: a function takes a value and returns a value. So each `foreach` becomes a function from one level of the message to its text.

## 2. Joining lists

Three operations on lists do all the work.

```lean
#eval [1, 2] ++ [3]   -- [1, 2, 3]
#eval 0 :: [1, 2]     -- [0, 1, 2]
```

`++` joins two lists. `::` puts one element in front of a list.

```lean
#eval ['&'].intercalate [['a'], ['b', 'c']]   -- ['a', '&', 'b', 'c']
```

`sep.intercalate parts` joins the lists in `parts` and puts `sep` between them. Between, not after: the separator appears once for two parts, and not at all for one part.

```lean
#eval String.ofList (['&'].intercalate ["HOSP".toList, "1.2.3".toList])   -- "HOSP&1.2.3"
#eval String.ofList (['&'].intercalate ["HOSP".toList])                   -- "HOSP"
```

That is the pseudocode's "if not last … insert separator": a separator after every part except the last.

## 3. A component, a repetition, a field

Start from the inside. A component is its subcomponents with the subcomponent separator between them:

```lean
def encodeComponent (d : Delimiters) (c : Component) : List Char :=
  [d.subcomponent].intercalate c

#eval String.ofList (encodeComponent Delimiters.suggested ["HOSP".toList, "1.2.3".toList])   -- "HOSP&1.2.3"
```

The function takes two inputs: the delimiters `d`, since the separator is whatever the message declares, and the component `c`. `[d.subcomponent]` is the list of one character that `intercalate` puts between the parts.

Compare with `RepresentsComponent` of lesson 3. The relation said "a text of each subcomponent, with the separator between two". The function computes that text, and `#eval` prints it.

A repetition is its components with the component separator between them. Each component must be written first, and `map` does that (lesson 1):

```lean
def encodeRepetition (d : Delimiters) (r : Repetition) : List Char :=
  [d.component].intercalate (r.map (encodeComponent d))

#eval String.ofList (encodeRepetition Delimiters.suggested [["SMITH".toList], ["JOHN".toList]])   -- "SMITH^JOHN"
```

`encodeComponent d` is `encodeComponent` with its first input given: a function that still waits for a component. `r.map (encodeComponent d)` applies it to each component of `r`, and gives a list of texts for `intercalate` to join.

A field is its repetitions with the repetition separator between them, in the same way:

```lean
def encodeField (d : Delimiters) (f : Field) : List Char :=
  [d.repetition].intercalate (f.map (encodeRepetition d))

#eval String.ofList (encodeField Delimiters.suggested [[["123".toList]], [["456".toList]]])   -- "123~456"
```

The three functions have one shape: write each part of the level below, and join the results with this level's separator.

## 4. The fields of a segment

The next level is different. The pseudocode does not say "if not last": it inserts the field separator before every field.

```text
foreach field in ( fields_of( segment ) ) {
  insert field separator;
```

`flatMap` applies a function that returns a list to each element, and joins the results with nothing between them:

```lean
#eval [1, 2, 3].flatMap fun n => [n, n]   -- [1, 1, 2, 2, 3, 3]
```

So the fields of a segment are, for each field, the field separator followed by the field:

```lean
def encodeFields (d : Delimiters) (fields : List Field) : List Char :=
  fields.flatMap fun f => d.field :: encodeField d f

#eval String.ofList (encodeFields Delimiters.suggested
  [[[["123".toList]], [["456".toList]]], [[["SMITH".toList], ["JOHN".toList]]]])   -- "|123~456|SMITH^JOHN"
```

The text starts with `|`. That is the statement `field_separator_after_segment_id`: the field separator "also separates the segment ID from the first data field in each segment." `flatMap` is the function for the shape `Concatenated` of lesson 3, as `intercalate` is the function for `Separated`.

## 5. A segment

```text
insert segment.name;   /* e.g., MSH */
```

A segment is its ID, then its fields:

```lean
def encodeSegment (d : Delimiters) (s : Segment) : List Char :=
  s.id ++ encodeFields d s.fields

def pid : Segment :=
  { id := "PID".toList,
    fields := [[[["123".toList]], [["456".toList]]], [[["SMITH".toList], ["JOHN".toList]]]] }

#eval String.ofList (encodeSegment Delimiters.suggested pid)   -- "PID|123~456|SMITH^JOHN"
```

## 6. The MSH segment

> The other delimiters are defined in the MSH segment, with the field delimiter in the 4th character position, and the other delimiters occurring as in the field called Encoding Characters, which is the first field after the segment ID. (§2.5.4)

Its text is `MSH`, the field separator, the encoding characters, and then its other fields like any segment:

```lean
def mshId : List Char := ['M', 'S', 'H']

def encodeHeader (d : Delimiters) (header : List Field) : List Char :=
  mshId ++ d.field :: d.encodingCharacters ++ encodeFields d header

#eval String.ofList (encodeHeader Delimiters.suggested [[[["LAB".toList]]]])   -- "MSH|^~\\&|LAB"
```

Lean prints the string with its backslash doubled: the text is `MSH|^~\&|LAB`. The field separator is the 4th character, and the four encoding characters follow it.

## 7. The message

```text
insert segment_terminator;   /* always<cr>! */
```

A message is MSH and then each segment, each followed by the segment terminator:

```lean
def encode (m : Message) : List Char :=
  (encodeHeader m.delimiters m.header :: m.segments.map (encodeSegment m.delimiters)).flatMap
    fun line => line ++ [segmentTerminator]
```

Read it in two steps. `encodeHeader … :: m.segments.map …` is the list of lines: the text of MSH in front of the text of each segment. `flatMap fun line => line ++ [segmentTerminator]` puts the terminator after each line and joins them. Every level below takes the delimiters from `m.delimiters`: one set for the whole message.

A carriage return does not show well on a screen. This helper prints it as `␍`:

```lean
def render (text : List Char) : String :=
  String.ofList (text.map fun c => if c = segmentTerminator then '␍' else c)
```

`if … then … else …` chooses between two values. `render` is for reading only; it is not part of the specification.

```lean
def message : Message :=
  { delimiters := Delimiters.suggested,
    header := [[[["LAB".toList]]]],
    segments := [pid, { id := "PV1".toList, fields := [] }] }

#eval render (encode message)   -- "MSH|^~\\&|LAB␍PID|123~456|SMITH^JOHN␍PV1␍"
```

The smallest message has no fields after MSH-2 and no other segment:

```lean
#eval render (encode { delimiters := Delimiters.suggested, header := [], segments := [] })   -- "MSH|^~\\&␍"
```

## 8. Other delimiters

The delimiters are an input, so the same message with other delimiters is another text:

```lean
def otherDelimiters : Delimiters :=
  { field := '#', component := '*', repetition := '~', escape := '\\', subcomponent := '&' }

#eval render (encode { message with delimiters := otherDelimiters })   -- "MSH#*~\\&#LAB␍PID#123~456#SMITH*JOHN␍PV1␍"
```

`{ message with delimiters := … }` is `message` with one field replaced.

The escape character is declared in MSH-2 and written there, and the writer uses it nowhere else. It belongs to the `substitute` lines, which this lesson left out.

## 9. The same, in the specification

`Hl7v2/Spec/Encoding.lean` holds these functions, each with the lines of the pseudocode it formalizes. Compare yours with the specification's on the message above:

```lean
#eval encode message == Hl7v2.Spec.encode message   -- true

end Lesson4
```

## 10. Facts about the text of every message

> …with the field delimiter in the 4th character position (§2.5.4)

From here on, the lesson uses the specification's functions and proves claims about them. Open the specification and its theorems:

```lean
open Hl7v2.Spec Hl7v2.Thm

namespace Lesson4
```

`encode` is now `Hl7v2.Spec.encode`. The namespace is opened again so that `message` and `render` are in reach.

A claim about the text of every message takes the message as an input (lesson 2). `drop 3` removes the first three characters of a list, and `take 1` keeps the first one of what is left:

```lean
example (m : Message) : ((encode m).drop 3).take 1 = [m.delimiters.field] := rfl
```

Nothing is known about `m`, and `rfl` still proves the claim. Lean computes with `m` as an unknown: `encode m` starts with `encodeHeader m.delimiters m.header`, which is `'M' :: 'S' :: 'H' :: m.delimiters.field :: …`. Dropping three characters and taking one leaves `[m.delimiters.field]`, whatever it is.

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

The 4th character is `m.delimiters.field`, which is `|` only for some messages.

The specification has three such theorems, in `Hl7v2/Thm/Encoding.lean`:

```lean
#check @encode_starts_with_msh   -- @encode_starts_with_msh : ∀ (m : Message), List.take 3 (encode m) = mshId
#check @field_separator_is_fourth_character   -- @field_separator_is_fourth_character : ∀ (m : Message), List.take 1 (List.drop 3 (encode m)) = [m.delimiters.field]
#check @encoding_characters_follow_field_separator   -- @encoding_characters_follow_field_separator : ∀ (m : Message), List.take 4 (List.drop 4 (encode m)) = m.delimiters.encodingCharacters
```

Each is proved by `rfl`. A change to `encode` that moved the delimiters would make them fail to build.

## 11. The sender writes a text of its message

Lesson 3 proved that one text represents one message, piece by piece. The claim for every message:

```lean
example (m : Message) : Represents (encode m) m := encode_represents m
```

`rfl` cannot prove this one: it is not an equality, and its proof has to follow the segments and fields of `m`, however many there are. That is a proof by **induction**. See it on one shape, `Concatenated`, where the text of an item is `f a` for some function `f`:

```lean
theorem concatenated_flatMap {α : Type} (f : α → List Char) (items : List α) :
    Concatenated (fun t a => t = f a) (items.flatMap f) items := by
  induction items with
  | nil => exact .nil
  | cons a as ih => exact .cons rfl ih
```

`induction items with` splits the claim in two, after the two ways a list is built:

- `nil`: the list is empty. `[].flatMap f` is `[]`, and the case `.nil` of `Concatenated` proves that the empty text is a text of no item.
- `cons a as ih`: the list is `a :: as`. `ih` is a proof of the claim for `as`, the shorter list: `Concatenated … (as.flatMap f) as`. The text `(a :: as).flatMap f` is `f a ++ as.flatMap f`, so the case `.cons` applies: `rfl` proves that `f a` is the text of `a`, and `ih` covers the rest.

`exact` gives the proof of the goal as a value. `ih` is the induction hypothesis: to prove the claim for a list, one may use it for the list without its first item.

The proof of `encode_represents`, in `Hl7v2/Thm/Represents.lean`, does this at each level: `Separated` for `intercalate`, `Concatenated` for `flatMap`.

Look at what the theorem asks of `m`: nothing. Every value of `Message` has a text, also one that breaks the rule of lesson 2.

## 12. One message, one text

The specification proves more than `encode_represents`: a text represents a message exactly when it is the text the sender writes.

```lean
#check @represents_iff   -- represents_iff : ∀ (text : List Char) (m : Message), Represents text m ↔ text = encode m
```

`A ↔ B` reads "`A` exactly when `B`": it is a proof of `A → B` and a proof of `B → A`. For `h : A ↔ B`, `h.1` is the first and `h.2` the second.

So the second question of lesson 3 has an answer. Two texts of one message are both `encode m`:

```lean
example (t₁ t₂ : List Char) (m : Message) (h₁ : Represents t₁ m) (h₂ : Represents t₂ m) : t₁ = t₂ :=
  ((represents_iff t₁ m).1 h₁).trans ((represents_iff t₂ m).1 h₂).symm
```

`(represents_iff t₁ m).1 h₁` turns the proof that `t₁` represents `m` into a proof of `t₁ = encode m`, and the same for `t₂`. `.symm` turns `t₂ = encode m` around, and `.trans` chains `t₁ = encode m` with `encode m = t₂`. The specification names this theorem `represents_text_unique`.

`represents_iff` also makes the relation computable. Whether a text represents a message is now an equality of two lists, and `decide` settles an equality. A text that does not represent `message`:

```lean
example : ¬ Represents "MSH|^~\\&\r".toList message :=
  fun h => absurd ((represents_iff _ _).1 h) (by decide)
```

`¬ A` is "if `A`, then a contradiction", so its proof is a function that takes a proof `h` of `A`. `(represents_iff _ _).1 h` is a proof that the text equals `encode message`; `by decide` proves that it does not; `absurd` puts the two together. The `_` are inputs Lean finds from `h`.

One question of lesson 3 is left: can a text represent two messages? `represents_iff` says what it comes to. If `t` represents `m₁` and `m₂`, then `encode m₁ = encode m₂`. Lesson 5 asks whether that forces `m₁ = m₂`.

```lean
end Lesson4
```

## What you can now say

About HL7v2:

- The text a sender writes represents its message, for every message. No rule is needed.
- A message has exactly one text.
- Every text a sender writes starts with `MSH`, its 4th character is the field separator, and the encoding characters follow.
- A sender writes a message from the inside out: subcomponents joined with their separator, then components, then repetitions.
- The field separator comes before every field, so it also follows the segment ID.
- Every segment ends with a carriage return, the last one too.

About Lean:

- A loop that inserts text becomes a function from a value to its text, one function per level.
- `++` joins two lists, `::` adds an element in front, `intercalate` joins with a separator between, `flatMap` joins with nothing between.
- A function with its first input given, such as `encodeComponent d`, is a function of the remaining inputs.
- `induction` proves a claim about every list: once for the empty list, and once for `a :: as` given a proof for `as`.
- `A ↔ B` is "`A` exactly when `B`". `h.1` uses it from left to right and `h.2` from right to left.
- `¬ A` is proved by a function that takes a proof of `A` and reaches a contradiction.

## Exercises

**1. Predict.** What does `encodeField Delimiters.suggested [[["A".toList], ["B".toList, "C".toList]], [["D".toList]]]` write?

<details><summary>Answer</summary>

`A^B&C~D`. This is the field of lesson 1, exercise 1.

</details>

**2. Empty fields.** What does this write, and why are there two `|` in a row?

```lean
#eval String.ofList (Hl7v2.Spec.encodeFields Delimiters.suggested
  [[[["a".toList]]], [[[]]], [[["c".toList]]]])   -- "|a||c"
```

<details><summary>Answer</summary>

`|a||c`. The second field is one repetition of one component of one subcomponent with no characters, so its text is empty. The field separator still comes before it, and the next field's separator follows at once.

</details>

**3. Change the writer.** In your file, replace `flatMap fun f => d.field :: encodeField d f` in `encodeFields` with `[d.field].intercalate (fields.map (encodeField d))`. What does `encode message` write now, and which statement does it break?

<details><summary>Answer</summary>

`MSH|^~\&LAB␍PID123~456|SMITH^JOHN␍PV1␍`. The separator is now between the fields only, so nothing separates the segment ID from the first field: `field_separator_after_segment_id` is broken. The comparison with the specification, in section 9, prints `false`.

</details>

**4. Trailing fields.** The pseudocode says `break if last ( populated field )`. Write a segment whose last two fields are empty and look at its text. What would a sender that follows the pseudocode write?

<details><summary>Things to weigh</summary>

```lean
#eval String.ofList (Hl7v2.Spec.encodeFields Delimiters.suggested
  [[[["a".toList]]], [[[]]], [[[]]]])   -- "|a||"
```

This writer writes `|a||`. A sender that stops after the last populated field writes `|a`. In this specification those are the texts of two messages: a segment of three fields, and a segment of one. By `one_message_one_text`, neither message has the other's text.

The two messages mean the same to a receiver, by §2.6.2: fields "that are expected but were not included in a segment" are "not present". That is a claim about two messages, and the specification does not formalize it yet (`trailing_not_populated_omitted`).

</details>

**5. Not a text.** Prove that the text `MSH|^~\&␍PID␍` does not represent `Lesson4.message`.

<details><summary>Answer</summary>

```lean
example : ¬ Hl7v2.Spec.Represents "MSH|^~\\&\rPID\r".toList Lesson4.message :=
  fun h => absurd ((Hl7v2.Thm.represents_iff _ _).1 h) (by decide)
```

</details>

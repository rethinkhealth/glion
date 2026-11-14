# Lesson 4: One text, one meaning

A sender writes a message as text and a receiver reads it. The receiver has the text and nothing else. This lesson states the claim that makes that work, tries to prove it, and reads what the proof asks for.

It formalizes this statement from [the list](statements.md):

| Statement              | In this lesson                |
| ---------------------- | ----------------------------- |
| `one_text_one_meaning` | `encode_injective`, a theorem |

You need lessons 1 to 3.

## Setup

Create `spec/practice/Lesson4.lean` and start it with these lines:

```lean
import Hl7v2

open Hl7v2.Spec

namespace Lesson4
```

Paste each `lean` block below them, in order. A block marked "do not paste" is one Lean rejects, shown with its error.

## 1. The claim nobody wrote

Every statement so far is a sentence of the standard. This one is not. The standard never says that two different messages are never written as the same text. It relies on it:

- "Both the sender and receiver of the data must have predictable rules for how they will process the data." (§2.6)
- "When delimiters are included in any component, the delimiters SHALL be escaped. Failure to do so may alter the meaning of the component." (§2.7.1)
- "…so that no ambiguity can exist as to the individual or group location of any occurrence of segment X in a message instance." (§2.5.2)

Each sentence guards against one way a text could be read in two ways. None of them states the property they all protect.

**Why it matters.** A receiver reads a text back into a message. If one text can come from two different messages, the receiver has to pick one, and it cannot know which the sender meant. Nothing fails when it picks the wrong one: the text is valid, the receiver parses it, and a value lands in the wrong place. A patient identifier is read as two, a result is filed under another field. No rule for the receiver can repair this, because the information is not in the text any more.

So the claim is about the writer alone, and everything else in the standard stands on it. If it holds, a receiver that reads the text correctly recovers exactly what the sender meant. If it fails, the standard has a hole that no implementation can close.

A statement the standard assumes but does not write is exactly what a formal specification is for: it has to be written down to be checked.

## 2. The claim, in Lean

Two messages written as the same text are the same message (do not paste):

```lean skip
theorem encode_injective {m₁ m₂ : Message} (h : encode m₁ = encode m₂) : m₁ = m₂
```

Read it: `m₁` and `m₂` are any two messages, `h` is a proof that their texts are equal, and the conclusion is that the messages are equal. Curly brackets around `m₁ m₂` make them inputs Lean works out from `h`, so they need not be given.

A function with this property is called **injective**: it never sends two inputs to one output. The claim is that `encode` is injective.

It is stated for every message, with no rule: not even lesson 3's. The plan is to try to prove it as it stands and see what happens.

## 3. How to prove it: a reader

How do you show that two messages are equal, knowing only that their texts are? Suppose there were a function `decode` that reads a text back into the message it came from, so that `decode (encode m) = m` for every `m`. Then:

```text
m₁ = decode (encode m₁)     reading back
   = decode (encode m₂)     the texts are equal
   = m₂                     reading back
```

That is the whole argument, and it works for any writer and reader, so prove it once in general:

```lean
theorem eq_of_read_write {α β : Type} {write : α → β} {read : β → α} {a b : α}
    (ha : read (write a) = a) (hb : read (write b) = b) (h : write a = write b) : a = b := by
  rw [← ha, h, hb]
```

`α` and `β` are any two types, `write` and `read` any two functions between them. `rw` is a new tactic: `rw [e]` rewrites the goal with an equation `e`, replacing its left side with its right side. `←` uses the equation the other way round. The three rewrites are the three lines above:

| Step        | Goal after it            |
| ----------- | ------------------------ |
| start       | `a = b`                  |
| `rw [← ha]` | `read (write a) = b`     |
| `rw [h]`    | `read (write b) = b`     |
| `rw [hb]`   | `b = b`, closed by `rfl` |

So the claim follows from one fact: a reader that undoes the writer. The reader is a **proof device**. It exists to carry the proof, and it is not part of the specification: the specification says how a sender writes, and promises nothing about how any receiver is built.

The writer was built from the inside out (lesson 2), so build the reader the same way, starting with a component.

## 4. A reader for a component

`encodeComponent` joins the subcomponents with the subcomponent separator. The obvious way back is to split the text at that separator. `List.splitOn` does that:

```lean
def decodeComponent (d : Delimiters) (text : List Char) : Component :=
  text.splitOn d.subcomponent

#eval (decodeComponent Delimiters.suggested "HOSP&1.2.3".toList).map String.ofList   -- ["HOSP", "1.2.3"]
```

The fact to prove is `decodeComponent d (encodeComponent d c) = c`. Lean's library has a lemma about splitting a join:

```text
List.splitOn_intercalate (x : α) :
  (∀ l ∈ ls, x ∉ l) → ls ≠ [] → List.splitOn x ([x].intercalate ls) = ls
```

Read it as a function with three inputs and a conclusion: the separator `x`, a proof that no part holds `x`, a proof that there is at least one part. `→` between claims reads "if … then".

Try it (do not paste; read the error):

```lean skip
example (d : Delimiters) (c : Component) : decodeComponent d (encodeComponent d c) = c := by
  unfold decodeComponent encodeComponent
  refine List.splitOn_intercalate _ ?_ ?_
```

Line by line:

- **`unfold decodeComponent encodeComponent`** replaces the two names with their definitions. The goal becomes `List.splitOn d.subcomponent ([d.subcomponent].intercalate c) = c`. The lemma speaks of `splitOn` and `intercalate`, not of your names, so the goal must take that shape before the lemma can match it.
- **`refine List.splitOn_intercalate _ ?_ ?_`** uses the lemma. `_` means "a value I do not give; find it". `?_` means "a proof I do not have; hand it back as a new goal".

**How Lean finds `_`.** It matches the lemma's conclusion against the goal. This matching is called unification:

| The lemma's conclusion | The goal                         | So                     |
| ---------------------- | -------------------------------- | ---------------------- |
| `List.splitOn ?x …`    | `List.splitOn d.subcomponent …`  | `?x := d.subcomponent` |
| `[?x].intercalate ?ls` | `[d.subcomponent].intercalate c` | `?ls := c`             |
| `= ?ls`                | `= c`                            | agrees                 |

Each unknown takes the only value that makes the two sides the same. Writing `d.subcomponent` in place of `_` gives the same result.

Then the two `?_` are concrete claims, and nothing proves them. Lean reports them:

```text
error: unsolved goals
case refine_1
d : Delimiters
c : Component
⊢ ∀ (l : List Char), l ∈ c → ¬d.subcomponent ∈ l

case refine_2
d : Delimiters
c : Component
⊢ c ≠ []
```

**How to read a goal.** Above `⊢` is what you have; below it is what is left to prove. Here you have some delimiters `d` and some component `c`, and nothing is known about either.

- `refine_1` reads: no subcomponent `l` of `c` holds the subcomponent separator.
- `refine_2` reads: the component has at least one subcomponent.

Writing `refine` with `?_` is a way to ask Lean a question: you commit to a lemma, and Lean names exactly the facts that are missing.

## 5. Are the goals true?

Each goal is a claim about `c`, and `c` is any component. A goal like that either follows from something the claim forgot to assume, or it is false for some `c`. The goals themselves say what to try: a component with no subcomponent, and a subcomponent that holds `&`.

```lean
#eval (decodeComponent Delimiters.suggested (encodeComponent Delimiters.suggested [])).map String.ofList   -- [""]
#eval (decodeComponent Delimiters.suggested (encodeComponent Delimiters.suggested ["&".toList])).map String.ofList   -- ["", ""]
```

Both goals are false. `[]` is written as the empty text, which reads back as one empty subcomponent. `["&"]` is written `&`, which reads back as two empty subcomponents.

A component that does not read back means the reader got another component from the same text. So two components share a text:

```lean
example : encodeComponent Delimiters.suggested ["&".toList]
    = encodeComponent Delimiters.suggested ["".toList, "".toList] := by decide
```

And that carries all the way up. Here are two messages:

```lean
def one : Message :=
  { delimiters := Delimiters.suggested, header := [],
    segments := [{ id := "PID".toList, fields := [[[["&".toList]]]] }] }

def two : Message :=
  { delimiters := Delimiters.suggested, header := [],
    segments := [{ id := "PID".toList, fields := [[[["".toList, "".toList]]]] }] }

#eval String.ofList (encode one)   -- "MSH|^~\\&\x0dPID|&\x0d"

example : encode one = encode two ∧ one ≠ two := by decide
```

`∧` is "and", `≠` is "is not equal to". The last line is a proof that `one` and `two` are written as the same text, `MSH|^~\&␍PID|&␍`, and are different messages.

So the claim of section 2 is false. `encode`, as lesson 2 wrote it from the standard's construction, is not injective. The proof did not stop because it was hard. It stopped at the two places where the claim breaks, and no other lemma or proof would get past them.

## 6. Make the goals hypotheses

A false claim is repaired in one of two ways: exclude the inputs that break it, or change the definition so that they no longer do. The first is the direct one: assume each goal. A fact a theorem assumes is called a hypothesis.

```lean
theorem decodeComponent_encodeComponent (d : Delimiters) (c : Component) (hc : c ≠ [])
    (hs : ∀ s ∈ c, d.subcomponent ∉ s) : decodeComponent d (encodeComponent d c) = c :=
  List.splitOn_intercalate _ hs hc
```

The proof is the lemma, given its three inputs. With the two hypotheses, a component reads back.

Each hypothesis says something about messages: "a component has a subcomponent", "no subcomponent holds `&`". That makes each one a candidate rule for `Message.WF`. Keep going up first, and collect them.

## 7. One level up

A repetition is components joined with the component separator. Its reader splits there, then reads each component:

```lean
def decodeRepetition (d : Delimiters) (text : List Char) : Repetition :=
  (text.splitOn d.component).map (decodeComponent d)
```

"Split a join, then undo each part" needs a lemma of its own. The specification has it in `Hl7v2/Thm/Data/List.lean`, proved from the library's:

```text
map_splitOn_intercalate (x : Char) (p : List Char → α) (u : α → List Char) (t : List α) :
  t ≠ [] → (∀ a ∈ t, x ∉ u a) → (∀ a ∈ t, p (u a) = a) →
    (([x].intercalate (t.map u)).splitOn x).map p = t
```

`u` writes a part and `p` reads it. Try it (do not paste):

```lean skip
example (d : Delimiters) (r : Repetition) : decodeRepetition d (encodeRepetition d r) = r := by
  unfold decodeRepetition encodeRepetition
  refine Hl7v2.Thm.map_splitOn_intercalate _ _ _ _ ?_ ?_ ?_
```

```text
error: unsolved goals
case refine_1
d : Delimiters
r : Repetition
⊢ r ≠ []

case refine_2
d : Delimiters
r : Repetition
⊢ ∀ (a : Component), a ∈ r → ¬d.component ∈ encodeComponent d a

case refine_3
d : Delimiters
r : Repetition
⊢ ∀ (a : Component), a ∈ r → decodeComponent d (encodeComponent d a) = a
```

Three goals, and they will come back at every level:

| Goal       | Reads                                                   |
| ---------- | ------------------------------------------------------- |
| `refine_1` | This level has at least one part                        |
| `refine_2` | The text of a part does not hold this level's separator |
| `refine_3` | Each part reads back                                    |

`refine_3` is section 6's theorem. `refine_2` is new: the text of a component must not hold `^`. That text is the subcomponents and the `&` between them, so it holds no `^` when `^` is not `&`, and no subcomponent holds `^`:

```lean
theorem not_mem_encodeComponent {d : Delimiters} {x : Char} (hx : x ≠ d.subcomponent)
    {c : Component} (h : ∀ s ∈ c, x ∉ s) : x ∉ encodeComponent d c :=
  Hl7v2.Thm.not_mem_intercalate hx h
```

With that, the repetition reads back, under more hypotheses than the component did:

```lean
theorem decodeRepetition_encodeRepetition (d : Delimiters) (r : Repetition) (hr : r ≠ [])
    (hne : d.component ≠ d.subcomponent) (hc : ∀ c ∈ r, c ≠ [])
    (hs : ∀ c ∈ r, ∀ s ∈ c, d.subcomponent ∉ s) (hs' : ∀ c ∈ r, ∀ s ∈ c, d.component ∉ s) :
    decodeRepetition d (encodeRepetition d r) = r :=
  Hl7v2.Thm.map_splitOn_intercalate _ _ _ r hr
    (fun c hc' => not_mem_encodeComponent hne (hs' c hc'))
    (fun c hc' => decodeComponent_encodeComponent d c (hc c hc') (hs c hc'))
```

The last three lines are the lemma and its three proofs: `hr` for `refine_1`, then a function for `refine_2` and one for `refine_3`. Each function takes a component `c` and a proof `hc'` that it is in `r`, and returns the proof for that component.

Going up one level added three hypotheses: the repetition has a component (`hr`), the two separators differ (`hne`), and no subcomponent holds the component separator either (`hs'`).

## 8. All the way up

The remaining levels repeat the pattern. The specification proves each in `Hl7v2/Thm/Encoding/Decode.lean`; here is what each asks for.

| Level               | Reader                                                             | New hypotheses                                                                                      |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Component           | split at `&`                                                       | A component has a subcomponent. No subcomponent holds `&`                                           |
| Repetition          | split at `^`                                                       | A repetition has a component. `^` is not `&`. No subcomponent holds `^`                             |
| Field               | split at `~`                                                       | A field has a repetition. `~` is not `^` or `&`. No subcomponent holds `~`                          |
| Fields of a segment | drop the first `\|`, split at `\|`                                 | `\|` is not `~`, `^` or `&`. No subcomponent holds `\|`                                             |
| Segment             | the first three characters are the ID                              | A Segment ID has three characters                                                                   |
| Message             | drop the last `␍`, split at `␍`; delimiters from characters 4 to 8 | `␍` is not `\|`, `^`, `~`, `&` or the escape character. No Segment ID and no subcomponent holds `␍` |

Three things are worth noticing.

**The rule of lesson 3 is needed.** The reader of a segment takes the first three characters as the ID. That is correct only when the ID has three characters. The rule came from a sentence of the standard; the proof now shows what it is for.

**The theorems of lesson 3 are needed.** The reader takes the delimiters from characters 4 to 8 of the text. `field_separator_is_fourth_character` and `encoding_characters_follow_field_separator` are why that is right for every message.

**The escape character appears once.** MSH-2 holds it, so it is in the text, and the text is split at `␍`. So the escape character must not be `␍`. Nothing else is asked of it: this writer never writes it anywhere else.

## 9. The rules the proof asks for

Collect the hypotheses. The separators the table names are the specification's `Delimiters.separators`: the segment terminator and the field, component, repetition and subcomponent separators. `Message.WF` becomes:

| Rule                         | Says                                                         | Source               |
| ---------------------------- | ------------------------------------------------------------ | -------------------- |
| `separators_distinct`        | The segment terminator and the four separators are different | the proof            |
| `escape_not_terminator`      | The escape character is not the segment terminator           | the proof            |
| `segment_id_length`          | A Segment ID has three characters                            | the standard, §2.5.2 |
| `segment_id_no_terminator`   | A Segment ID does not hold the segment terminator            | the proof            |
| `field_has_repetition`       | A field holds at least one repetition                        | the proof            |
| `repetition_has_component`   | A repetition holds at least one component                    | the proof            |
| `component_has_subcomponent` | A component holds at least one subcomponent                  | the proof            |
| `subcomponent_no_separator`  | A subcomponent holds no separator and no segment terminator  | the proof            |

Seven of the eight are not sentences of Chapter 2. They are what the unwritten claim costs, written down.

`decide` checks all eight on a message. The message `two` of section 5 meets them, and `one` does not:

```lean
example : two.WF := by decide

example : ¬ one.WF := by decide
```

`one` holds `&` in a subcomponent, so it breaks `subcomponent_no_separator`. The pair that broke the claim in section 5 is no longer a pair of well-formed messages.

## 10. The theorem

With the rules as hypotheses, the reader undoes the writer for a whole message. The specification proves it:

```lean
#check @Hl7v2.Thm.decode_encode   -- @Hl7v2.Thm.decode_encode : ∀ {m : Message}, m.WF → Hl7v2.Thm.decode (encode m) = m
```

And the claim follows by section 3's argument:

```lean
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂ :=
  eq_of_read_write (Hl7v2.Thm.decode_encode h₁) (Hl7v2.Thm.decode_encode h₂) h
```

Two well-formed messages written as the same text are the same message. This is section 2's claim with two hypotheses added, `h₁` and `h₂`, and it is proved for every pair of messages, of any size, with any delimiters.

`#print axioms` lists what a proof rests on beyond Lean's logic:

```lean
#print axioms encode_injective   -- 'Lesson4.encode_injective' depends on axioms: [propext, Quot.sound]

end Lesson4
```

`propext` and `Quot.sound` are two standard axioms of Lean. Nothing else is assumed: no unproved step, and no trust in the reader beyond what Lean checked.

## 11. What the proof did not settle

The theorem holds, and the rules are exactly what this proof used. Two questions are still open, and the next lesson takes them up.

- **Is each rule needed, or only used?** A proof shows its hypotheses are enough. It does not show the claim fails without them. Section 5 showed that for two rules, with a counterexample each. The others have none yet.
- **Is each rule acceptable?** A rule excludes messages. `subcomponent_no_separator` excludes every value that holds `|`, `^`, `~` or `&`. Whether HL7v2 can live with that is a question about the standard, not about the proof.

## What you can now say

About HL7v2:

- "One text, one meaning" is not a sentence of the standard. The standard relies on it, and without it a receiver can be wrong with no error anywhere.
- The construction of §2.6.1.0, with each value written as it is, does not have the property: `MSH|^~\&␍PID|&␍` is the text of two messages.
- It has the property for messages that meet eight rules, and seven of them are not written in Chapter 2.

About Lean:

- A function is injective when equal outputs come only from equal inputs. A reader that undoes the writer proves it.
- `rw [e]` rewrites the goal with an equation; `←` reverses it.
- `refine lemma _ ?_ ?_` commits to a lemma and returns the missing facts as goals. Above `⊢` is what you have, below it what is left.
- An unsolved goal about an arbitrary input is a missing hypothesis or a counterexample. The goal says what to try.
- A proof shows its hypotheses are enough. It does not show they are needed.

## Exercises

**1. Read the goals.** Without running it, write the three goals Lean reports for the field level:

```lean skip
example (d : Delimiters) (f : Field) :
    Hl7v2.Thm.decodeField d (encodeField d f) = f := by
  unfold Hl7v2.Thm.decodeField encodeField
  refine Hl7v2.Thm.map_splitOn_intercalate _ _ _ _ ?_ ?_ ?_
```

<details><summary>Answer</summary>

```text
⊢ f ≠ []
⊢ ∀ (a : Repetition), a ∈ f → ¬d.repetition ∈ encodeRepetition d a
⊢ ∀ (a : Repetition), a ∈ f → Hl7v2.Thm.decodeRepetition d (encodeRepetition d a) = a
```

The field has a repetition, the text of a repetition does not hold `~`, and each repetition reads back.

</details>

**2. The other counterexample.** Section 5 built two messages from the subcomponent `&`. Build two messages with the same text from the first goal, a component with no subcomponent, and prove it with `decide`.

<details><summary>Answer</summary>

```lean
def noSubcomponent : Message :=
  { delimiters := Delimiters.suggested, header := [],
    segments := [{ id := "PID".toList, fields := [[[[]]]] }] }

def emptySubcomponent : Message :=
  { delimiters := Delimiters.suggested, header := [],
    segments := [{ id := "PID".toList, fields := [[[["".toList]]]] }] }

example : encode noSubcomponent = encode emptySubcomponent ∧ noSubcomponent ≠ emptySubcomponent := by decide

example : ¬ noSubcomponent.WF := by decide
```

Both are written `MSH|^~\&␍PID|␍`. `noSubcomponent` has a component with no subcomponent and breaks `component_has_subcomponent`. So an empty field is one repetition of one component of one empty subcomponent, and never an empty list: the question lesson 1 left open in its last exercise.

</details>

**3. The theorem, the other way round.** Prove that two well-formed messages that differ have different texts.

```lean skip
example {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF) (h : m₁ ≠ m₂) : encode m₁ ≠ encode m₂
```

<details><summary>Answer</summary>

```lean
example {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF) (h : m₁ ≠ m₂) : encode m₁ ≠ encode m₂ :=
  fun he => h (Hl7v2.Thm.encode_injective h₁ h₂ he)
```

`a ≠ b` means "from `a = b`, a contradiction follows", so its proof is a function that takes a proof of `a = b`. Given `he`, that the texts are equal, the theorem says the messages are equal, which contradicts `h`.

</details>

**4. Equal delimiters.** The proof asked that `^` is not `&`. Build two messages that declare `^` for both the component and the subcomponent separator and are written as the same text.

<details><summary>Answer</summary>

```lean
def sameSeparators : Delimiters := { Delimiters.suggested with subcomponent := '^' }

def twoComponents : Message :=
  { delimiters := sameSeparators, header := [],
    segments := [{ id := "PID".toList, fields := [[[["a".toList], ["b".toList]]]] }] }

def twoSubcomponents : Message :=
  { delimiters := sameSeparators, header := [],
    segments := [{ id := "PID".toList, fields := [[[["a".toList, "b".toList]]]] }] }

example : encode twoComponents = encode twoSubcomponents ∧ twoComponents ≠ twoSubcomponents := by
  decide
```

Both are written `MSH|^~\^␍PID|a^b␍`. So `separators_distinct` is needed, not only used: without it the claim fails.

</details>

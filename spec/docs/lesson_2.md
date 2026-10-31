# Lesson 2: The rules

This lesson reads `Hl7v2/Spec/WellFormed.lean`, about 70 lines: the rules a message must follow so that its text has exactly one meaning. It also writes your first proofs, with `decide`.

Create `Hl7v2/Lesson2.lean`, start it with these lines, and paste each example below them:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm

def good : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["1".toList]]]]⟩]⟩
def oneSegment : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a\rPV1".toList]]]]⟩]⟩
def twoSegments : Message :=
  ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a".toList]]]]⟩, ⟨"PV1".toList, []⟩]⟩
```

Every example in this lesson builds without errors, except the ones marked as showing an error.

## Step 1: Why the spec needs rules

```lean
#eval encode oneSegment == encode twoSegments   -- true
```

These are two different messages that produce the same text, `MSH|^~\&␍PID|a␍PV1␍`. The first has a segment terminator inside a value, so a receiver can't tell which one the sender meant. A `|` inside a value is no longer a problem: the sender writes `a|b` as `a\F\b`, an escape sequence (§2.7.1, lesson 6). Each rule in `WellFormed.lean` rules out one way of building a message like that. With every rule in place, the spec proves that every piece of text has exactly one meaning; that theorem is `encode_injective`, in lesson 4.

## Step 2: Read the file in three parts

**1. An instance and a helper.**

- The `instance … Decidable` line tells Lean how to check `Distinct`. Step 4 explains it.
- `Message.fields` lists every field in the message: the MSH fields from MSH-3 on, then the fields of every other segment.

**2. `Message.WF`.** WF stands for "well formed". It's a `structure` whose type is `Prop`, so each of its fields is a statement, not a value. A message is well formed only when all eight statements hold. Read each `∀ … ∈ …` as "for every … in …":

```text
field_has_repetition : ∀ f ∈ m.fields, f ≠ []    -- every field holds at least one repetition
```

This rule answers lesson 1's puzzle: it rules out `[]`, so an empty field can only be `[[[[]]]]`.

**3. The catalogue.** The catalogue gives each rule a name and a check that returns a `Bool`. `failures` returns the names of the rules a message breaks:

```lean
#eval oneSegment.failures    -- ["well_formed_subcomponent_no_terminator"]
#eval twoSegments.failures   -- []
```

The same rules are now written twice: once as statements in `WF`, and once as checks in the catalogue. Nothing in this file proves that the two say the same thing. That's what the theorem `wf_iff_failures_nil` proves, in lesson 3.

## Step 3: `Message.fields`

`Message.fields` collects every field of a message into one flat list: the MSH fields first, then the fields of each later segment, in order. The rules use it so each one can say "for every field of the message" once, rather than repeating itself for MSH and for every other segment.

```text
def Message.fields (m : Message) : List Field :=
  m.header ++ m.segments.flatMap (·.fields)
```

| Part                         | Meaning                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `def Message.fields`         | Defines `fields` in the `Message` namespace, so you can call it as `m.fields`, like a method in TypeScript. |
| `(m : Message) : List Field` | Takes a message and returns a list of fields.                                                               |
| `m.header`                   | MSH-3 onwards. MSH-1 and MSH-2 are in `delimiters`, so they're not included.                                |
| `++`                         | Join two lists.                                                                                             |
| `m.segments.flatMap (…)`     | For each segment, get its list of fields, then join all those lists into one.                               |
| `(·.fields)`                 | Shorthand for `fun s => s.fields`: the `·` stands for the argument.                                         |

The name `fields` means two different things on this one line. `m.fields` is this new function, because `m` is a `Message`. `s.fields`, inside `(·.fields)`, is the `fields` of the `Segment` structure, because `s` is a `Segment`. Lean picks the right one from the type of the value before the dot:

```lean
#check (·.fields : Segment → List Field)   -- fun x => x.fields : Segment → List Field
```

On the message `MSH|^~\&|APP␍PID|1|Smith␍PV1|I␍`:

```lean
def threeSegments : Message := ⟨Delimiters.suggested, [[[["APP".toList]]]],
  [⟨"PID".toList, [[[["1".toList]]], [[["Smith".toList]]]]⟩, ⟨"PV1".toList, [[[["I".toList]]]]⟩]⟩

#eval threeSegments.segments.map (·.fields.length)   -- [2, 1]   PID has 2 fields, PV1 has 1
#eval threeSegments.fields.map fun f => String.ofList (encodeField Delimiters.suggested f)
-- ["APP", "1", "Smith", "I"]
```

The segment IDs (`PID`, `PV1`) aren't in the list, because they aren't fields. Two separate rules cover them: `segment_id_length` and `segment_id_no_terminator`.

**Why the rules need it.** Because `m.fields` includes `header`, the MSH fields from MSH-3 on follow the same rules as every other field. If the definition were only `m.segments.flatMap (·.fields)`, a segment terminator inside MSH-3 would pass every rule, and the message would have more than one meaning again. Leaving MSH-1 and MSH-2 out is just as deliberate: they are written as the delimiters themselves, while a field's value is written through its escape sequences, so the encoding characters `^~\&` as a field would become `\S\\R\\E\\T\`.

## Step 4: Instances

An instance is how you tell Lean "here is how to do X for this type". Lean then finds and uses it automatically, wherever X is needed.

A **type class** is like a TypeScript interface: it names a capability. An **instance** is the implementation of that capability for one particular type. The difference from TypeScript is that you never pass the instance yourself: Lean searches for it whenever an expression needs it.

| Type class    | Capability                                           | Where you've already used it                               |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `Repr`        | Print a value                                        | `#eval Delimiters.suggested` prints `{ field := '\|', … }` |
| `DecidableEq` | Check whether two values are equal                   | `#eval ([] : Field) = [[[[]]]]` gives `false`              |
| `Decidable P` | A program that settles whether statement `P` is true | `decide`, and `#eval` on a statement                       |

`deriving DecidableEq, Repr` on `Delimiters` writes the first two instances for you.

### The instance in `WellFormed.lean`

```text
instance (d : Delimiters) : Decidable d.Distinct :=
  inferInstanceAs (Decidable d.all.Nodup)
```

Read it as: "to decide `d.Distinct`, decide `d.all.Nodup`, which you already know how to do."

- `Distinct` is defined as `d.all.Nodup`, and Lean already has a `Decidable` instance for "this list has no duplicates".
- But Lean's instance search doesn't look inside the definition of `Distinct`, so it doesn't find that instance by itself.
- `inferInstanceAs` points Lean at it: "use the instance for this other, equivalent form."

That is why this line works, though lesson 1 needed `decide … .all.Nodup`:

```lean
#eval Delimiters.suggested.Distinct   -- true
```

| Part                     | Meaning                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `instance`               | "Here is an implementation Lean may find automatically."                 |
| `(d : Delimiters)`       | It works for any delimiters, like a generic function's parameter.        |
| `: Decidable d.Distinct` | What it provides: a way to settle "are the delimiters of `d` distinct?"  |
| `inferInstanceAs (…)`    | "Find the instance for this other statement, and use it for mine."       |
| `Decidable d.all.Nodup`  | That other statement, which is the definition of `Distinct` written out. |

### What `Decidable` really is

It isn't just a `Bool`. A `Decidable P` value is one of two things:

```text
isTrue  (h : P)     -- "yes", with a proof that P holds
isFalse (h : ¬P)    -- "no", with a proof that P does not hold
```

So when `decide` answers, the answer comes with its evidence. That's why `by decide` counts as a proof: Lean's checker runs the program, and the program's result carries a proof of the statement or of its opposite.

### Why Lean can't find it alone

This example shows an error, on purpose. A copy of `Distinct` with no instance:

```lean
def Distinct' (d : Delimiters) : Prop := d.all.Nodup
#eval decide (Distinct' Delimiters.suggested)
-- error: failed to synthesize instance of type class Decidable (Distinct' Delimiters.suggested)
```

When Lean searches for an instance, it matches the statement by its name and doesn't open up definitions. It sees `Distinct' d`, finds no instance registered under that name, and stops. "Failed to synthesize" means "I searched and found no instance". `inferInstanceAs` is the bridge: it opens the definition once, and connects `Distinct` to the form Lean can decide.

### How Lean builds the program

Once Lean is pointed at `d.all.Nodup`, it builds the checker from smaller instances it already has. `#synth` shows which instance it picks at each step:

```lean
#synth Decidable Delimiters.suggested.Distinct
#synth Decidable Delimiters.suggested.all.Nodup
#synth DecidableEq Char
```

```text
d.Distinct                instDecidableDistinct  the instance above: decide d.all.Nodup
 └─ d.all.Nodup           List.nodupDecidable    compare every pair of the 6 characters
     └─ c = c'            instDecidableEqChar    compare two characters
```

```lean
#eval decide Delimiters.suggested.Distinct                                  -- true
#eval decide ({ Delimiters.suggested with component := '|' }.Distinct)      -- false
```

The rule `well_formed_delimiters_distinct` runs this check on the message's delimiters. The other seven rules need no instance of their own: each is built from `∀ … ∈ …`, `=`, `≠` and `∉` over lists and characters, which Lean already knows how to decide.

**Why instances matter for the spec.** Every rule in `Message.WF` is a statement. Statements are what proofs are about, but Lean can't run them. A `Decidable` instance for a rule is a program that settles it, which gives the rule two uses: in a proof, `by decide` settles it for one concrete message; on real messages, the catalogue calls `decide` on each rule. Not every statement can have an instance. "This message breaks no rule" can be decided, because a message is finite. "Every well-formed message has exactly one encoding" can't, because there are infinitely many messages. That one needs a written proof.

## Step 5: Your first proofs, with `decide`

`decide` doesn't only print results; it can also prove statements:

```lean
example : Delimiters.suggested.Distinct := by decide
example : ∀ s ∈ oneSegment.segments, s.id.length = 3 := by decide
```

### What `:= by decide` means

It means "here is the proof, and Lean should build it by running a check". Three pieces, each with its own job.

**`:=` gives the value**, the same as in `def`. The central idea of Lean: **a claim is a type, and a proof is a value of that type.** `def x : Nat := 2 + 3` gives a value of type `Nat`. `theorem two_plus_three : 2 + 3 = 5 := …` gives a value of type `2 + 3 = 5`, and a value of that type is a proof. If you can't produce a value of the type, the build fails.

**`by` says "build the proof for me".** You could write the proof value yourself, but proofs get long. `by` switches to **tactic mode**: instead of writing the value, you give commands, and Lean builds the value from them.

**`decide` is one tactic.** It says "this claim can be checked by running a program, so run it". When the program answers `true`, it builds the proof from that answer. When it answers `false`, it fails.

`#print` shows the value `decide` built:

```lean
theorem two_plus_three : 2 + 3 = 5 := by decide
#print two_plus_three
-- theorem two_plus_three : 2 + 3 = 5 := of_decide_eq_true (id (Eq.refl true))
```

| Piece               | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `Eq.refl true`      | "`true` equals `true`": the answer the check produced                         |
| `id (…)`            | Leaves its argument unchanged; it can be ignored                              |
| `of_decide_eq_true` | A theorem that says: if the check for a claim returns `true`, the claim holds |

So the proof says: "the check for `2 + 3 = 5` returns `true`, therefore `2 + 3 = 5`". To accept it, Lean's checker runs the check itself and confirms the answer really is `true`. You don't have to trust `decide`, only the checker.

### Two ways `decide` can fail

These two examples show errors, on purpose.

**The claim is false.**

```lean
def shortId : Message := ⟨Delimiters.suggested, [], [⟨"PI".toList, [[[["1".toList]]]]⟩]⟩

example : ∀ s ∈ shortId.segments, s.id.length = 3 := by decide
-- error: Tactic `decide` proved that the proposition … is false
```

**There's no program to run.**

```lean
example : ∀ m : Message, m.delimiters.Distinct := by decide
-- error: failed to synthesize Decidable (∀ (m : Message), m.delimiters.Distinct)
```

There are infinitely many messages, so no program can check them all. That's the limit of `decide`. A claim about every message needs a proof written step by step, like the ones in lessons 3 and 4.

### Proving that something is false

To state that a claim is false, put `¬` ("not") in front of it:

```lean
example : ¬ (∀ s ∈ shortId.segments, s.id.length = 3) := by decide
```

In plain words: **it is not true that every segment ID in `shortId` is three characters long.** `decide` finds the program for the inner claim, runs it, gets "false" with evidence (`PI` has length 2), and because of the `¬`, that proves the whole claim.

|                             | `#eval shortId.failures`                               | `example … := by decide`           |
| --------------------------- | ------------------------------------------------------ | ---------------------------------- |
| What it does                | Runs the catalogue and prints the result               | Proves a statement                 |
| If the result is unexpected | Prints something different, and the build still passes | The build fails                    |
| What it relies on           | The catalogue's `Bool` checks                          | The rule itself, from `Message.WF` |

So `#eval` is for looking at a value, and `example … by decide` is a check that fails the build.

## Step 6: `m.WF`, a bundle of eight proofs

`m.WF` is the statement "message `m` is well formed". It's shorthand for `Message.WF m`: writing a dot after a value calls the function of that name in its type's namespace, as with `m.fields`.

Because `Message.WF` is a `structure` of type `Prop`, each field is a **proof of one rule**, and a value of type `m.WF` is a bundle of eight proofs. You build it as you would build any structure, with `⟨…⟩` and one proof per field:

```lean
example : good.WF :=
  ⟨by decide, by decide, by decide, by decide, by decide, by decide, by decide, by decide⟩

example : good.WF := by decide
```

The one-step version works because `Thm/WellFormed.lean` gives `Message.WF` a `Decidable` instance. Going the other way, if you're given a proof that a message is well formed, you can take one rule out of it, like reading a field:

```lean
example (h : good.WF) : good.delimiters.Distinct := h.delimiters_distinct
```

## Exercises

For each of these, build a message whose `failures` lists exactly the one rule named:

1. `well_formed_segment_id_length`
2. `well_formed_repetition_has_component`. Hint: a field holding one repetition that has no components.
3. `well_formed_delimiters_distinct`. Hint: `{ Delimiters.suggested with … }`.

Then:

4. Build one message that breaks two rules at once.
5. Write an `example … := by decide` that proves one of your messages breaks its rule.

<details><summary>Answers</summary>

```lean
-- 1. A two-character segment ID (`shortId`, from step 5).
#eval shortId.failures   -- ["well_formed_segment_id_length"]

-- 2. A field holding one repetition with no components.
def emptyRepetition : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[]]]⟩]⟩
#eval emptyRepetition.failures   -- ["well_formed_repetition_has_component"]

-- 3. The component separator is also the field separator.
def sameDelimiters : Message :=
  ⟨{ Delimiters.suggested with component := '|' }, [], [⟨"PID".toList, [[[["1".toList]]]]⟩]⟩
#eval sameDelimiters.failures   -- ["well_formed_delimiters_distinct"]

-- 4. Two rules at once: a two-character ID, and a segment terminator inside a value.
def twoRules : Message := ⟨Delimiters.suggested, [], [⟨"PI".toList, [[[["a\rb".toList]]]]⟩]⟩
#eval twoRules.failures   -- ["well_formed_segment_id_length", "well_formed_subcomponent_no_terminator"]

-- 5. A proof, by running the check: `emptyRepetition` breaks its rule.
example : ¬ (∀ f ∈ emptyRepetition.fields, ∀ r ∈ f, r ≠ []) := by decide
```

</details>

## What you can now say

- **The rules:** eight statements in `Message.WF`, each ruling out one way for a text to have two meanings.
- **Two copies:** the same rules as `Bool` checks in `catalogue`, so `failures` can name the rule a message breaks.
- **Instances:** a `Decidable` instance is a program that settles a statement, and `decide` runs it.
- **Proofs about one message:** `by decide`. Proofs about every message need more, which is lesson 3.

[Lesson 3](lesson_3.md) reads the first written proof, `wf_iff_failures_nil`: the two copies of the rules say the same thing.

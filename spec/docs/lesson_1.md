# Lesson 1: A message as data

Before anything can be said about an HL7v2 message, Lean has to know what a message is. This lesson writes that down: the delimiters, then the levels of a message from a subcomponent up to the message itself. It assumes no Lean.

It formalizes these statements from [the list](statements.md):

| Statement                               | In this lesson         |
| --------------------------------------- | ---------------------- |
| `segment_terminator_is_carriage_return` | `segmentTerminator`    |
| `message_delimiters`                    | `Delimiters`           |
| `suggested_delimiters`                  | `Delimiters.suggested` |
| `encoding_characters_order`             | `encodingCharacters`   |
| `field_is_characters`                   | `Subcomponent`         |
| `component_holds_subcomponents`         | `Component`            |
| `field_holds_components`                | `Repetition`           |
| `field_may_repeat`                      | `Field`                |
| `segment_is_fields`                     | `Segment`              |
| `message_is_segments`                   | `Message`              |

## Setup

Install [elan](https://github.com/leanprover/elan), which installs Lean. Then build the specification once:

```sh
cd spec && lake build
```

Create the file `spec/practice/Lesson1.lean`. Git ignores the `practice` folder, so the file is yours. Start it with these lines, and paste each `lean` block of the lesson below them, in order:

```lean
import Hl7v2

namespace Lesson1
```

`import Hl7v2` loads the specification; section 7 uses it. `namespace Lesson1` puts your definitions under the name `Lesson1`, so they do not collide with the specification's, which have the same names.

Open the file in VS Code with the Lean 4 extension, and Lean checks it as you type: the result of each line shows in the "Lean InfoView" panel. From a terminal, `lake env lean practice/Lesson1.lean` prints the same results.

## 1. Lean runs programs

`#eval` runs an expression and prints its value. The text after `--` is a comment; in these lessons it shows what Lean prints.

```lean
#eval 1 + 1          -- 2
#eval "PID".length   -- 3
#eval '|'            -- '|'
```

`"PID"` is a `String`, a piece of text. `'|'` is a `Char`, one character. `"PID".length` calls the function `String.length` on `"PID"`: the dot is how Lean applies a function that belongs to a type.

Every expression has a type, and `#check` prints it:

```lean
#check '|'     -- '|' : Char
#check "PID"   -- "PID" : String
```

Read `:` as "has type".

## 2. A definition

> The segment terminator is always a carriage return (in ASCII, a hex 0D). (§2.5.4)

`def` gives a value a name:

```lean
def segmentTerminator : Char := '\r'
```

Read it as: `segmentTerminator` has type `Char`, and it is `'\r'`, the carriage return. Once defined, the name stands for the value:

```lean
#eval segmentTerminator         -- '\x0d'
#eval segmentTerminator.toNat   -- 13
```

Lean prints the carriage return as `'\x0d'`, its number in hexadecimal. `Char.toNat` gives the same number in decimal. The standard says "hex 0D", and that is what the definition holds.

## 3. A structure

> In constructing a message, certain special characters are used. They are the segment terminator, the field separator, the component separator, subcomponent separator, repetition separator, escape character and truncation character. (§2.5.4)

The segment terminator is fixed. The others are chosen by each message, so a message carries them. A `structure` is a value made of named parts, called fields:

```lean
structure Delimiters where
  field : Char
  component : Char
  repetition : Char
  escape : Char
  subcomponent : Char
  deriving DecidableEq, Repr
```

`Delimiters` is a new type. A value of it holds five characters. `deriving DecidableEq, Repr` asks Lean to write two things for the new type: how to compare two values (`DecidableEq`) and how to print one (`Repr`).

The truncation character is not among the five. The specification does not model it yet, and its row in the statements list says so.

Figure 2-1 of the standard suggests a value for each:

```lean
def Delimiters.suggested : Delimiters :=
  { field := '|', component := '^', repetition := '~', escape := '\\', subcomponent := '&' }

#eval Delimiters.suggested.component   -- '^'
#eval Delimiters.suggested.escape      -- '\\'
```

`{ field := '|', … }` builds a value by naming each field. `.component` reads one field back. The escape character `\` is written `'\\'` in Lean, and printed that way too, because Lean itself uses `\` to write special characters such as `'\r'`.

The name `Delimiters.suggested` has a dot in it on purpose: a definition named `Delimiters.something` belongs to the type `Delimiters`.

### A function

> MSH-2: This field contains five characters in the following order: the component separator, repetition separator, escape character, subcomponent separator, and truncation character. (§2.14.9.2)

MSH-2 is computed from the delimiters, so it is a function: a definition that takes an input.

```lean
def Delimiters.encodingCharacters (d : Delimiters) : List Char :=
  [d.component, d.repetition, d.escape, d.subcomponent]

#eval Delimiters.suggested.encodingCharacters                   -- ['^', '~', '\\', '&']
#eval String.ofList Delimiters.suggested.encodingCharacters     -- "^~\\&"
```

`(d : Delimiters)` is the input, and `List Char` is the type of the result: a list of characters. `[a, b, c]` builds a list. Because the function's name starts with `Delimiters.`, it can be called with a dot on any value of that type: `Delimiters.suggested.encodingCharacters`.

`String.ofList` turns a list of characters into a string, which is easier to read. `"^~\\&"` is the four characters `^~\&`.

## 4. Lists inside lists

> A field is a string of characters. (§2.5.3)

The specification holds text as a list of characters, `List Char`, and not as a `String`. Later lessons join and split text, and Lean's tools for that work on lists. `String.toList` converts:

```lean
#eval "SMITH".toList   -- ['S', 'M', 'I', 'T', 'H']
```

A field is not one string, though. The standard gives it three levels:

> Composite data types are made up of a series of components … the components of a component are called sub-components (§2.5.3.4)
>
> Whether the field may repeat. … Note that components and subcomponents may not repeat (§2.5.3.6)

So, from the inside out: a subcomponent is characters, a component is a list of subcomponents, one occurrence of a field is a list of components, and a field is a list of occurrences. The standard calls an occurrence a repetition.

```lean
abbrev Subcomponent := List Char
abbrev Component := List Subcomponent
abbrev Repetition := List Component
abbrev Field := List Repetition
```

`abbrev` gives a type a second name. `Field` and `List (List (List (List Char)))` are the same type; the names say which level each list is.

Each level adds one pair of brackets. Take a patient name, written `SMITH^JOHN` with the suggested delimiters. It is one occurrence of two components, each of one subcomponent:

```lean
def patientName : Field :=
  [                          -- the field
    [                        -- its one repetition
      ["SMITH".toList],      -- first component: one subcomponent
      ["JOHN".toList]        -- second component: one subcomponent
    ]
  ]

#eval patientName.length   -- 1
```

`patientName.length` is 1: the field has one repetition. A field that repeats has more. Two identifiers, written `123~456`:

```lean
def identifiers : Field :=
  [ [["123".toList]], [["456".toList]] ]

#eval identifiers.length   -- 2
```

And a component with subcomponents, written `HOSP&1.2.3`:

```lean
def authority : Component := ["HOSP".toList, "1.2.3".toList]

#eval authority.length   -- 2
```

| Written as   | Value                                   | Levels used       |
| ------------ | --------------------------------------- | ----------------- |
| `SMITH`      | `[[["SMITH".toList]]]`                  | none              |
| `SMITH^JOHN` | `[[["SMITH".toList], ["JOHN".toList]]]` | two components    |
| `123~456`    | `[[["123".toList]], [["456".toList]]]`  | two repetitions   |
| `HOSP&1.2.3` | `[[["HOSP".toList, "1.2.3".toList]]]`   | two subcomponents |

The type also formalizes `components_do_not_repeat`: below a field there is one repetition level and no other, so a component has nowhere to repeat.

## 5. Segments and messages

> A segment is a logical grouping of data fields. … Each segment is identified by a unique three-character code known as the Segment ID. (§2.5.2)

```lean
structure Segment where
  id : List Char
  fields : List Field
  deriving DecidableEq, Repr

def pid : Segment :=
  { id := "PID".toList, fields := [identifiers, patientName] }

#eval String.ofList pid.id   -- "PID"
#eval pid.fields.length      -- 2
```

> A message is the atomic unit of data transferred between systems. It is comprised of a group of segments in a defined sequence. (§2.5.1)

The first segment of a message is MSH, and it is not like the others: its first two fields are the delimiters themselves (lesson 2 writes them). So a message holds the delimiters, the other fields of MSH, and the segments after MSH:

```lean
structure Message where
  delimiters : Delimiters
  header : List Field
  segments : List Segment
  deriving DecidableEq, Repr

def message : Message :=
  { delimiters := Delimiters.suggested,
    header := [[[["LAB".toList]]]],
    segments := [pid, { id := "PV1".toList, fields := [] }] }

#eval message.segments.length   -- 2
```

One `Delimiters` value sits at the top of the message. That formalizes `delimiters_hold_for_whole_message`: "The delimiter values used in the MSH segment are the delimiter values used throughout the entire message."

### `fun` and `map`

To list the segment IDs of a message, apply a function to each segment. `List.map` does that, and `fun` writes a function without naming it:

```lean
#eval message.segments.map fun s => String.ofList s.id   -- ["PID", "PV1"]
```

`fun s => String.ofList s.id` reads "given a segment `s`, its ID as a string". `map` applies it to every segment and returns the list of results.

### Comparing two values

`deriving DecidableEq` lets `==` compare two values of the type:

```lean
#eval pid == pid                                        -- true
#eval pid == { id := "PV1".toList, fields := [] }       -- false
```

Two segments are equal when their IDs and their fields are equal, level by level. Lesson 4 depends on this: "two different messages" means two values of `Message` that `==` tells apart.

## 6. What the type does not say

The type says what a message is made of. It does not say which messages make sense. Both of these are values of their types:

```lean
def shortId : Segment := { id := "PI".toList, fields := [] }

def noRepetition : Field := []
```

The standard says a Segment ID is three characters, and `shortId` has two. A type like `List Char` cannot say "three". Statements like that become rules, in lesson 3.

End your namespace here:

```lean
end Lesson1
```

## 7. The same, in the specification

What you wrote is the specification. Open `Hl7v2/Spec/Delimiters.lean` and `Hl7v2/Spec/Message.lean`: they hold the same definitions, and each has a comment that quotes the standard and names its statement, such as `(segment_terminator_is_carriage_return, §2.5.4)`.

The specification's definitions live in the namespace `Hl7v2.Spec`. `open` lets you use them by their short names:

```lean
open Hl7v2.Spec

#eval segmentTerminator.toNat                                   -- 13
#eval String.ofList Delimiters.suggested.encodingCharacters     -- "^~\\&"

def labMessage : Message :=
  { delimiters := Delimiters.suggested,
    header := [[[["LAB".toList]]]],
    segments := [{ id := "PID".toList, fields := [[[["123".toList]]], [[["SMITH".toList], ["JOHN".toList]]]] }] }

#eval labMessage.segments.map fun s => String.ofList s.id   -- ["PID"]
```

From lesson 2 on, the practice file uses the specification's definitions and adds to them.

## What you can now say

About HL7v2:

- A message declares five delimiters; the segment terminator is fixed.
- A field holds repetitions, a repetition holds components, a component holds subcomponents, and a subcomponent holds characters. Nothing below a field repeats.
- A message is its delimiters, the fields of MSH from MSH-3 on, and the segments after MSH.

About Lean:

- `#eval` runs an expression; `#check` prints its type.
- `def` names a value or a function. `structure` makes a type from named fields. `abbrev` gives a type a second name.
- A definition named `T.f` is called with a dot on a value of type `T`.
- A type says what a value is made of, not which values are acceptable.

## Exercises

**1. Write a field.** Write the field `A^B&C~D` as a value of type `Field`. How many repetitions, components and subcomponents does it have?

<details><summary>Answer</summary>

```lean
def exercise1 : Hl7v2.Spec.Field :=
  [ [["A".toList], ["B".toList, "C".toList]], [["D".toList]] ]

#eval exercise1.length   -- 2
```

Two repetitions. The first has two components, `A` with one subcomponent and `B&C` with two. The second has one component of one subcomponent.

</details>

**2. Other delimiters.** Define the delimiters `#`, `*`, `~`, `\`, `&` (field, component, repetition, escape, subcomponent). What is their MSH-2?

<details><summary>Answer</summary>

```lean
def exercise2 : Hl7v2.Spec.Delimiters :=
  { field := '#', component := '*', repetition := '~', escape := '\\', subcomponent := '&' }

#eval String.ofList exercise2.encodingCharacters   -- "*~\\&"
```

</details>

**3. Read a type.** Without running it, what is the type of `message.segments.map fun s => s.fields.length`? What does it print for the `message` of section 5?

<details><summary>Answer</summary>

`List Nat`: one number per segment. It prints `[2, 0]`: `PID` has two fields, `PV1` has none.

</details>

**4. An empty field.** `[[[[]]]]` and `[]` are both values of type `Field`. Describe each in words. Which one would you use for a field a sender leaves empty?

<details><summary>Things to weigh</summary>

`[[[[]]]]` is one repetition of one component of one subcomponent with no characters. `[]` is a field with no repetition at all. The type allows both. The lesson does not settle which one an empty field is; a later lesson has to, when a proof asks.

</details>

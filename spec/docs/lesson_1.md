# Lesson 1: Delimiters, messages and encoding

This lesson reads the three files that say what an HL7v2 message is and how a sender writes it as text:

| Part | File                         | What it says                                   |
| ---- | ---------------------------- | ---------------------------------------------- |
| A    | `Hl7v2/Spec/Delimiters.lean` | The five delimiters and the segment terminator |
| B    | `Hl7v2/Spec/Message.lean`    | What a message is made of                      |
| C    | `Hl7v2/Spec/Encoding.lean`   | How a message becomes text                     |

There is no proof in this lesson. Every definition here is a program you can run.

## Set up (once)

- Install [elan](https://github.com/leanprover/elan). It installs the Lean version named in `lean-toolchain`.
- Install the `lean4` extension in VS Code.
- Open the `spec/` folder itself in VS Code, not the repo root.
- Run `lake build` in `spec/`.

Open any `.lean` file. The first time, the extension can take a minute to start Lean. When it is ready, a panel called the **infoview** opens on the right. Put your cursor on a line, and the infoview shows the result of that line.

Create `Hl7v2/Lesson1.lean`, start it with these lines, and paste each example below them:

```lean
import Hl7v2
open Hl7v2.Spec
```

Every example in this lesson builds without errors.

## Part A: Delimiters

### Read the file

`Hl7v2/Spec/Delimiters.lean` is about 45 lines. Four things to notice:

| In the file                                       | What it means                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `def segmentTerminator : Char := '\r'`            | A named value: its name, then its type after `:`, then its value after `:=`. Here a constant of type `Char`.        |
| `structure Delimiters where field : Char …`       | A record with five named fields. `deriving DecidableEq` lets Lean check whether two of them are equal.              |
| `⟨'\|', '^', '~', '\\', '&'⟩`                     | Builds a `Delimiters` by filling its fields in order. `'\\'` is one backslash.                                      |
| `def Delimiters.Distinct (d : Delimiters) : Prop` | A **statement**, not a value: "all six characters are different". Its type is `Prop`, which is why it isn't `Bool`. |

Each `/-- … -/` comment quotes the Chapter 2 sentence the definition comes from. While you read, ask yourself whether the Lean says what the quote says. That check is your job; Lean can't do it.

### Run it

```lean
#eval Delimiters.suggested
#eval Delimiters.suggested.component
#eval Delimiters.suggested.all
#check Delimiters.Distinct
#eval decide Delimiters.suggested.all.Nodup
#eval decide ({ Delimiters.suggested with component := '|' }).all.Nodup
```

You should see:

- the five delimiters by name;
- `'^'`;
- `['\x0d', '|', '^', '~', '\\', '&']`, where `\x0d` is `\r`;
- `Delimiters.Distinct (d : Delimiters) : Prop` for the `#check` line;
- `true`, then `false`.

### Reading the last line

The last line asks: if the component separator were also `|`, would all the delimiters still be different characters? Read it from the inside out:

| Piece                          | Meaning                                                            | Value                                       |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------- |
| `Delimiters.suggested`         | The suggested delimiters                                           | `\|`, `^`, `~`, `\`, `&`                    |
| `{ … with component := '\|' }` | A copy of them with one field changed; the original isn't modified | `\|`, `\|`, `~`, `\`, `&`                   |
| `.all`                         | Every delimiter plus the segment terminator, as a list             | `['\r', '\|', '\|', '~', '\\', '&']`        |
| `.Nodup`                       | The statement "this list has no duplicates"                        | A `Prop`, which Lean can't print on its own |
| `decide …`                     | Runs a check that settles the statement                            | `false`                                     |
| `#eval`                        | Runs the expression and shows the result in the infoview           | `false`                                     |

**Why it needs `decide`.** `.Nodup` is a statement, of type `Prop`. Lean doesn't simply evaluate a statement. Some statements can't be checked by a program at all, for example "every message has property P", since there are infinitely many messages. "This list of six characters has no duplicates" can be checked by a program: compare each pair. `decide` finds that program and runs it, which turns the `Prop` into a `Bool` you can print. Lesson 2 explains how Lean finds that program.

**Why this line matters in the spec.** The standard never says the delimiters must be different characters. This line builds the case where they aren't. With `|` as both the field and the component separator, a reader of `PID|a|b` can't tell whether it holds two fields or one field of two components. The spec proves that ambiguity as the theorem `ambiguous_without_distinct_delimiters` (lesson 4), and that is why it adds `Distinct` as a rule of its own.

### Questions

1. Why does `all` include the segment terminator, while `encodingCharacters` doesn't?
2. `separators` leaves out the escape character. Why? The comment above it gives the reason.

<details><summary>Answers</summary>

1. `encodingCharacters` is MSH-2 as the sender writes it: the four characters after the field separator. The segment terminator is not written there; it is always `\r`. `all` is every character that has a special meaning in the message, so it adds the field separator and the segment terminator.
2. The escape character may appear inside data, as part of an escape sequence such as `\F\` (§2.7). The other separators never may.

</details>

## Part B: Message

`Hl7v2/Spec/Message.lean` says what a message is made of. It's about 40 lines, and there's no logic in it: only names for types and two records.

### The four nested types

```lean
#print Subcomponent   -- List Char
#print Field          -- List Repetition
```

In the file:

```text
abbrev Subcomponent := List Char
abbrev Component := List Subcomponent
abbrev Repetition := List Component
abbrev Field := List Repetition
```

`abbrev` gives an existing type a new name; it doesn't create a new type. So `Field` is just another name for `List (List (List (List Char)))`. The names are there for you to read; Lean treats them all as nested lists.

Each level adds one pair of brackets:

| HL7v2 text | Level                                                 | Lean value                        |
| ---------- | ----------------------------------------------------- | --------------------------------- |
| `a`        | Subcomponent                                          | `['a']`                           |
| `a`        | Component                                             | `[['a']]`                         |
| `a`        | Repetition                                            | `[[['a']]]`                       |
| `a`        | Field                                                 | `[[[['a']]]]`                     |
| `a&b`      | Field: one component of two subcomponents             | `[[[['a'], ['b']]]]`              |
| `a^b~c`    | Field: two repetitions, the first with two components | `[[[['a']], [['b']]], [[['c']]]]` |

### The two records

```text
structure Segment where
  id : List Char          -- "PID"
  fields : List Field     -- one more bracket: the list of fields

structure Message where
  delimiters : Delimiters -- MSH-1 and MSH-2
  header : List Field     -- MSH-3 onwards
  segments : List Segment -- everything after MSH
```

`mshId` is `['M','S','H']`. It isn't stored in the message, because every message starts with MSH.

### What is `header`?

`header` holds the MSH fields that come after the delimiters: MSH-3, MSH-4 and onwards. MSH-1 and MSH-2 aren't in it, because they're stored in `delimiters`.

MSH-1 and MSH-2 aren't ordinary fields. They declare the delimiters the rest of the message uses:

- **MSH-1** is the field separator itself, written as the 4th character of the message.
- **MSH-2** lists the other four delimiters, written as they are: `^~\&`. A receiver can't split MSH-2 on `^` before it knows that `^` is the component separator.

So the spec doesn't treat them as data. It stores them once, as `delimiters`. Everything after them in MSH is ordinary data and goes in `header`. The `segments` list then holds every segment after MSH.

```text
MSH|^~\&|APP|FAC␍PID|1␍
   └─┬─┘ └──┬───┘ └─┬─┘
delimiters header  segments
(MSH-1, 2) (MSH-3, 4)
```

```lean
#eval String.ofList (encode ⟨Delimiters.suggested, [[[[['A','P','P']]]], [[[['F','A','C']]]]], [⟨['P','I','D'], [[[[['1']]]]]⟩]⟩)
-- "MSH|^~\\&|APP|FAC\x0dPID|1\x0d"

#eval String.ofList (encode ⟨Delimiters.suggested, [], []⟩)
-- "MSH|^~\\&\x0d"
```

The second line shows that an empty `header` and an empty `segments` still give a valid MSH, with only the delimiters. The arguments of `⟨…⟩` are in field order: delimiters first, then header, then segments.

### The bracket trap

`header` has four brackets per field (`[[[['A','P','P']]]]`) while each segment's fields are written with five (`[[[[['1']]]]]`). The outer bracket in the segment line is the list of fields: a `List Field` holding one field is five brackets deep.

Getting the depth wrong is the most common error when writing an example. Lean reports it like this:

```text
Application type mismatch: The argument 'a' has type Char
but is expected to have type Subcomponent
```

Read that as "one bracket missing around `'a'`".

Three more things trip people up:

- **`'Smith'` is not a character.** Single quotes hold exactly one character, a `Char`. Double quotes make a `String`. A subcomponent is a `List Char`, so write `['S','m','i','t','h']` or `"Smith".toList`.
- **Use `⟨ … ⟩` to build a structure, not `( … , … )`.** `(a, b)` builds a pair, a different type. In VS Code, type `\<` and `\>` to get the angle brackets.
- **Name the pieces to find the error.** Give each field a type, so an error points at one line:

```lean
def f1 : Field := [[["1".toList]]]
def f2 : Field := [[["Smith".toList], ["John".toList]]]
#eval String.ofList (encodeSegment Delimiters.suggested ⟨"PID".toList, [f1, f2]⟩)   -- "PID|1|Smith^John"
```

### Try it

`encodeField` comes from part C, but you can use it now to check your brackets:

```lean
#eval String.ofList (encodeField Delimiters.suggested [[[['a'], ['b']]]])               -- "a&b"
#eval String.ofList (encodeField Delimiters.suggested [[[['a']], [['b']]], [[['c']]]])  -- "a^b~c"
```

### A puzzle

```lean
#eval String.ofList (encodeField Delimiters.suggested [])        -- ""
#eval String.ofList (encodeField Delimiters.suggested [[[[]]]])  -- ""
#eval ([] : Field) = [[[[]]]]                                     -- false
```

Two different values produce the same text: an empty field. `[]` is a field with no repetitions. `[[[[]]]]` is a field with one repetition, holding one component, holding one empty subcomponent. So if a receiver reads an empty field, which of the two did the sender mean?

<details><summary>Answer</summary>

The spec always records an empty field as `[[[[]]]]`. A field written as `[]` isn't allowed in a well-formed message: that's the rule "every level holds at least one element", which lesson 2 meets as `well_formed_field_has_repetition`. Because `[]` is ruled out, each piece of text has exactly one meaning.

</details>

### Exercises

1. Write the field `1^2^3` and the field `x~y~z`, and check each with `encodeField`.
2. Write the segment `PID|1|Smith^John` as a `Segment`, and encode it with `encodeSegment Delimiters.suggested`.

<details><summary>Answers</summary>

```lean
#eval String.ofList (encodeField Delimiters.suggested [[[['1']], [['2']], [['3']]]])    -- "1^2^3"
#eval String.ofList (encodeField Delimiters.suggested [[[['x']]], [[['y']]], [[['z']]]])  -- "x~y~z"

#eval String.ofList (encodeSegment Delimiters.suggested
  ⟨"PID".toList, [[[["1".toList]]], [[["Smith".toList], ["John".toList]]]]⟩)   -- "PID|1|Smith^John"
```

Compare the two shapes of the first exercise:

```text
x^y^z   [ [ [['x']], [['y']], [['z']] ] ]      one repetition, three components
x~y~z   [ [[['x']]], [[['y']]], [[['z']]] ]    three repetitions, one component each
```

With `^`, one pair of brackets groups all three letters together. With `~`, each letter sits in its own group. In HL7v2 terms, `~` is how a sender writes a field more than once, for example a patient with three identifiers in PID-3. `^` splits one value into parts, for example a family name and a given name.

</details>

## Part C: Encoding

`Hl7v2/Spec/Encoding.lean` turns a `Message` into text: five short functions, each building on the one before.

### Four pieces of Lean syntax used in the file

| Syntax                | Meaning                                            | Example                                   | Result                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------- | --------------------------- |
| `sep.intercalate xs`  | Join a list of lists, putting `sep` between them   | `[','].intercalate [['a'], ['b'], ['c']]` | `['a', ',', 'b', ',', 'c']` |
| `xs.flatMap f`        | Apply `f` to each element, then join the results   | `[1, 2].flatMap fun n => [n, n * 10]`     | `[1, 10, 2, 20]`            |
| `fun x => …`          | A function with no name                            | `fun n => [n, n * 10]`                    |                             |
| `x :: xs`, `xs ++ ys` | Put one element in front of a list; join two lists | `'\|' :: ['a']`                           | `['\|', 'a']`               |

`f <| x` just means `f x`. It saves you from writing brackets around a long `x`.

```lean
#eval [','].intercalate [['a'], ['b'], ['c']]   -- ['a', ',', 'b', ',', 'c']
#eval [1, 2].flatMap fun n => [n, n * 10]       -- [1, 10, 2, 20]
```

### Read the five functions

**`encodeField`** works from the inside out:

```text
[d.repetition].intercalate <| f.map fun r =>          -- 3. join repetitions with ~
  [d.component].intercalate <| r.map fun c =>         -- 2. join components with ^
    [d.subcomponent].intercalate (c.map (escape d))   -- 1. write each subcomponent, join with &
```

`escape`, from `Hl7v2/Spec/Escape.lean`, writes a delimiter that is part of the data as its escape sequence (§2.7.1), so a value can hold any delimiter and still be read back. Lesson 6 reads it.

```lean
#eval String.ofList (encodeField Delimiters.suggested [[["a|b".toList]]])   -- "a\\F\\b"
```

**`encodeFields`** writes the field separator _before_ each field, not between fields:

```text
fields.flatMap fun f => d.field :: encodeField d f
```

That one choice is why a segment with no fields is just its ID, and why an empty field still shows up:

```lean
#eval String.ofList (encodeSegment Delimiters.suggested ⟨"PID".toList, []⟩)        -- "PID"   no fields
#eval String.ofList (encodeSegment Delimiters.suggested ⟨"PID".toList, [[[[[]]]]]⟩)  -- "PID|"  one empty field
#eval String.ofList (encodeFields Delimiters.suggested [[[["a".toList]]], [[[[]]]], [[[[]]]]])  -- "|a||"
```

The last line shows that trailing empty fields are kept. In the spec, an empty field at the end is still a field, and it's written as a field separator. That's the same rule glion's parser follows (ADR 0033).

**`encodeSegment`** is the ID followed by the fields.

**`encodeHeader`** writes MSH: `MSH`, then the field separator (MSH-1), then the four encoding characters (MSH-2), then the header fields. MSH-1 and MSH-2 come from `delimiters`, never from `header`.

**`encode`** writes MSH first, then each segment, and puts `\r` after every one of them, including the last.

### Exercises

1. **Predict, then run.** Write down what this prints before you run it. The delimiters fill the fields in order: `field`, `component`, `repetition`, `escape`, `subcomponent`.

   ```lean
   #eval String.ofList (encodeHeader ⟨'#', '*', '!', '%', '+'⟩ [[[["A".toList]]]])
   ```

2. **Build a whole message** that `encode` writes as `MSH|^~\&|APP␍PID|1|Smith^John␍`. In the output, `␍` shows as `\x0d`.
3. **Find the asymmetry.** `encodeFields` puts `|` before each field. What would `PID|a|` decode to if a receiver assumed the separator came _after_ each field instead?

<details><summary>Answers</summary>

1. `"MSH#*!%+#A"`: `MSH`, the field separator `#`, the four encoding characters `*!%+`, then `#` before the one header field.
2. ```lean
   #eval String.ofList (encode ⟨Delimiters.suggested, [[[["APP".toList]]]],
     [⟨"PID".toList, [[[["1".toList]]], [[["Smith".toList], ["John".toList]]]]⟩]⟩)
   -- "MSH|^~\\&|APP\x0dPID|1|Smith^John\x0d"
   ```
3. Read as "separator after each field", `PID|a|` is the ID `PID` followed by an empty field (ending at the first `|`) and the field `a`. Read the spec's way, "separator before each field", it is the field `a` followed by an empty field. The two readings give the fields in a different order and disagree about where the empty field is, so sender and receiver must agree on one; the spec follows Chapter 2, "insert field separator" before each field.

</details>

## What you can now say

- **Delimiters:** five characters declared in MSH-1 and MSH-2, plus `\r`. The standard suggests `|^~\&` but never says they must differ; the spec adds that rule.
- **Messages:** delimiters, the MSH fields from MSH-3 on, and the other segments. A field is four levels of nested lists.
- **Encoding:** a delimiter in data as its escape sequence, join at each level, a field separator before each field, `\r` after each segment.

[Lesson 2](lesson_2.md) adds the rules: what makes a message well formed, and what `decide` can prove about it.

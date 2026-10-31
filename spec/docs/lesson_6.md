# Lesson 6: Changing the statement: escape sequences

Lesson 5 ended with a finding: glion decodes the escape sequences of HL7v2 §2.7, and the specification had none. glion followed the standard, so the statement was the side to change. This lesson reads that change: what was added, which rule was replaced, how the proof of `decode_encode` absorbed it, and how the harness then found the next disagreement.

It is also the first time the statement itself changes. A proof can change freely; a statement is what people own and review. Step 5 shows what that review looks like.

Part 2 (steps 8 to 13) goes through every other escape sequence in §2.7. It sorts them into kinds, models a value that holds markup as well as characters, proves that model reads back, and uses it to explain each place where glion writes a sequence differently from how it read it.

Create `Hl7v2/Lesson6.lean`, start it with these lines, and paste each example below them:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm
```

## Step 1: What §2.7.1 says

> An escape sequence consists of the escape character followed by an escape code ID of one character, zero (0) or more data characters, and another occurrence of the escape character.

Five sequences stand for the delimiters themselves:

| Sequence | Stands for                 |
| -------- | -------------------------- |
| `\F\`    | the field separator        |
| `\S\`    | the component separator    |
| `\T\`    | the subcomponent separator |
| `\R\`    | the repetition separator   |
| `\E\`    | the escape character       |

So a value may hold any delimiter: the sender writes it as its sequence, and the receiver reads it back. `SMITH&JONES` goes on the wire as `SMITH\T\JONES`.

The rest of §2.7 defines more sequences: truncation (`\P\`), highlighting (`\H\`, `\N\`), formatted text (`\.br\`, `\.sp\`, …), hexadecimal data (`\Xdd\`), locally defined sequences (`\Z…\`) and character sets. The specification models only the five above, and the README lists the rest under "Not yet covered". Part 2 of this lesson takes them one by one.

## Step 2: `Spec/Escape.lean`

The new file is about 40 lines, and two definitions:

```text
def escapeChar (d : Delimiters) (c : Char) : List Char :=
  if c = d.field then [d.escape, 'F', d.escape]
  else if c = d.component then [d.escape, 'S', d.escape]
  else if c = d.subcomponent then [d.escape, 'T', d.escape]
  else if c = d.repetition then [d.escape, 'R', d.escape]
  else if c = d.escape then [d.escape, 'E', d.escape]
  else [c]

def escape (d : Delimiters) (value : List Char) : List Char :=
  value.flatMap (escapeChar d)
```

`escapeChar` writes one character: a delimiter becomes three characters, anything else stays as it is. `escape` writes a whole value, one character at a time, and joins the results (`flatMap`, from lesson 1).

```lean
#eval String.ofList (escape Delimiters.suggested "SMITH&JONES".toList)   -- "SMITH\\T\\JONES"
#eval String.ofList (escape Delimiters.suggested "a|b".toList)           -- "a\\F\\b"
#eval String.ofList (escape Delimiters.suggested "\\".toList)            -- "\\E\\"
```

`#eval` prints a string with its backslashes doubled, so `"SMITH\\T\\JONES"` is the text `SMITH\T\JONES`.

One choice hides in the last line: **every escape character in data is data**. The specification writes it as `\E\`, so a value can never contain a formatting command:

```lean
#eval String.ofList (escape Delimiters.suggested "\\H\\".toList)   -- "\\E\\H\\E\\"
```

The value is the three characters `\H\`, and the sender writes `\E\H\E\`. Step 6 shows why this line matters.

`escapeCodes` lists the five code IDs, `['F', 'S', 'T', 'R', 'E']`, for a rule in step 4.

## Step 3: One line in `Spec/Encoding.lean`

`encodeField` joined subcomponents as they were. Now it writes each one through `escape` first:

```text
-      [d.subcomponent].intercalate c
+      [d.subcomponent].intercalate (c.map (escape d))
```

Nothing else in the encoding changes. MSH-1 and MSH-2 are still written as they are; they are the delimiters, not data.

```lean
def oneValue : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a|b".toList]]]]⟩]⟩
def twoFields : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[["a".toList]]], [[["b".toList]]]]⟩]⟩

#eval String.ofList (encode oneValue)      -- "MSH|^~\\&\x0dPID|a\\F\\b\x0d"
#eval encode oneValue == encode twoFields  -- false
```

Before this change, these two messages shared the text `PID|a|b`, and a rule forbade the first. Now the `|` is written `\F\`, the texts differ, and the first message is well formed:

```lean
#eval oneValue.failures   -- []
example : oneValue.WF := by decide
```

## Step 4: Two rules change

The old rule `well_formed_subcomponent_clean` said "a subcomponent contains no separator". Its job was to keep data from looking like structure. `escape` does that job now, for four of the five separators. Two rules take its place.

**`well_formed_subcomponent_no_terminator`: a subcomponent contains no segment terminator.** The fifth separator, `\r`, has no sequence among the five. HL7v2 writes a line break in data as `\.br\` in formatted text, or as `\X0D\`, and neither is modelled yet. So a value may not hold `\r`, and lesson 4's `oneSegment` still breaks a rule:

```text
PID with the value a␍PV1    →  MSH|^~\&␍PID|a␍PV1␍
PID|a, then PV1             →  MSH|^~\&␍PID|a␍PV1␍
```

**`well_formed_separators_not_escape_codes`: no separator is `F`, `S`, `T`, `R` or `E`.** The standard allows letters as delimiters. But a receiver splits a segment at its separators before it reads any escape sequence, and so does `decode`. With `S` as the field separator, the sequence `\S\` splits where it stands:

```lean
def sField : Delimiters := { Delimiters.suggested with field := 'S' }
def caret : Message := ⟨sField, [], [⟨"PID".toList, [[[["^".toList]]]]⟩]⟩

#eval String.ofList (encode caret)   -- "MSHS^~\\&\x0dPIDS\\S\\\x0d"
#eval decode (encode caret) == caret                -- false
#eval (decode (encode caret)).segments.map (·.fields)   -- [[[[[['\\']]]], [[[['\\']]]]]]
```

One field holding `^` is read back as two fields, each holding a lone `\`. The rule rules this case out. It is a decision of the specification, and the README records it with the other one, distinct delimiters. glion makes a different choice here: it writes `\X5E\`, the hexadecimal escape, when a code letter is a delimiter (#1051).

The catalogue grows from seven rules to eight:

```lean
#eval catalogue.length   -- 8
#eval caret.failures     -- ["well_formed_separators_not_escape_codes"]
```

## Step 5: What a reviewer sees

`Statements.lean` records each headline theorem's statement, its axioms, and the names of the rules. After this change, `lake build` failed on exactly one of them:

```text
- "well_formed_delimiters_distinct", "well_formed_segment_id_length", …,
-  "well_formed_subcomponent_clean"]
+ "well_formed_delimiters_distinct", "well_formed_separators_not_escape_codes", "well_formed_segment_id_length", …,
+  "well_formed_component_has_subcomponent", "well_formed_subcomponent_no_terminator"]
```

The statements of `encode_injective`, `ambiguous_without_distinct_delimiters` and `wf_iff_failures_nil` did not change, and neither did their axioms. So the review is about two things: the definition of `encode`, and the rules in `Message.WF`. `encode_injective` reads the same, but it now says more. It covers every value holding `|`, `^`, `~`, `&` or `\`, which it excluded before, and it excludes letter separators, which it covered before.

That is the review a person owns: what the words in the statement mean now. Whether the proof goes through is Lean's job.

## Step 6: How the proof absorbed it

`decode_encode` needs `decode` to undo `encode`. The new piece to undo is `escape`, so the proof gains a device in `Thm/Encoding/Escape.lean`: `unescape`, which reads a value back.

```lean
#eval String.ofList (unescape Delimiters.suggested "SMITH\\T\\JONES".toList)   -- "SMITH&JONES"
```

Three lemmas carry the change:

| Lemma                        | Says                                                                         | Needs                                                           |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `unescape_escapeChar_append` | Reading back one written character, then the rest, gives the character first | Nothing: one case per branch of `escapeChar`                    |
| `unescape_escape`            | `unescape d (escape d v) = v`                                                | Induction on `v`, with the lemma above                          |
| `not_mem_escape`             | A separator never appears in a written value                                 | Distinct delimiters, no separator a code letter, no `\r` in `v` |

`unescape_escape` needs no rule at all. `not_mem_escape` is where the two new rules are used, one each, and it replaces what `Clean` used to give the proof directly. `decodeField` reads each subcomponent through `unescape`, and each lemma about fields takes one more hypothesis, `hk`, the new rule. The structure of `decode_encode` from lesson 4's appendix is unchanged.

`FieldWF` lost its delimiters argument along the way. It used `d` only for `Clean d s`, and its new last clause, `segmentTerminator ∉ s`, doesn't need it.

## Step 7: The harness, again

With data now allowed to hold every delimiter, the generator draws them: `DATA` plus the five delimiters of the message. The parser property passed. It now records a mutant: `decodeEscapes` in `@glion/utils` decoding `\S\` to the repetition separator fails it on a value holding `^`.

The serializer property also passed, and lesson 5's step 7 repeated itself. A formatting command in data, the three characters `\H\`, came up in 19 of 5,000 generated messages and in none of the 200 a run uses. Once the generator drew whole sequences, the property failed within a few runs:

```text
spec:  MSH|*+!%|!E!H!E!*+␍
glion: MSH|*+!%|!H!*+␍
```

`!` is the escape character. The specification writes the data `!H!` as `!E!H!E!`, as step 2 said. glion's parser reads that back as `!H!`, which is right. Its serializer then writes `!H!` as it is, because `@glion/to-hl7v2` copies formatting commands through unchanged, and the text now holds a highlighting command the sender never wrote. This is the open finding of lesson 5's step 6.

# Part 2: Every escape sequence

## Step 8: The whole of §2.7

§2.7.1 lists six sequences that every field may use, and four more that only some data types may use:

> When a field, component or sub-component of type TX, FT, or CF is being encoded, additional escape character(s) may be used to signal certain special characteristics of portions of the text field.

§2.7.3 adds the character set sequences, and §2.7.7 the formatting commands of FT. One sentence of §2.7.1 applies to all of them:

> Escape sequences SHALL NOT contain nested escape sequences.

The table below has every sequence. The last two columns are glion today: what `decodeEscapes` in `@glion/utils` puts in the tree, and what `@glion/to-hl7v2` writes back. Each row was run through the parser and the serializer with the delimiters `|^~\&`.

| Sequence                                                | Section       | Data types | Stands for                        | glion's tree holds    | glion writes back |
| ------------------------------------------------------- | ------------- | ---------- | --------------------------------- | --------------------- | ----------------- |
| `\F\` `\S\` `\T\` `\R\` `\E\`                           | §2.7.1, 2.7.5 | all        | a delimiter                       | the delimiter         | the same sequence |
| `\P\`                                                   | §2.7.2        | all        | the truncation character          | the text `\P\`        | `\E\P\E\`         |
| `\H\` `\N\`                                             | §2.7.4        | TX, FT, CF | start and end highlighting        | the text `\H\`, `\N\` | the same sequence |
| `\Xdd…\`                                                | §2.7.6        | TX, FT, CF | bytes, read by agreement          | the UTF-8 characters  | the characters    |
| `\XFF\` (not UTF-8)                                     | §2.7.6        | TX, FT, CF | bytes, read by agreement          | the text `\XFF\`      | `\E\XFF\E\`       |
| `\Z…\`                                                  | §2.7.8        | TX, FT, CF | local, read by agreement          | the text              | the same sequence |
| `\Cxxyy\` `\Mxxyyzz\`                                   | §2.7.3        | FT, ST, TX | a switch to another character set | the text              | the same sequence |
| `\.br\`                                                 | §2.7.7        | FT         | begin a new output line           | a carriage return     | `\.br\`           |
| `\.sp\` `\.fi\` `\.nf\` `\.in\` `\.ti\` `\.sk\` `\.ce\` | §2.7.7        | FT         | the other formatting commands     | the text              | the same sequence |
| `\Q\` (no such code)                                    |               |            |                                   | the text `\Q\`        | `\E\Q\E\`         |

Two more rows complete the picture:

| Sequence    | glion's tree holds | glion writes back |
| ----------- | ------------------ | ----------------- |
| `\X0D\`     | a carriage return  | `\.br\`           |
| `\E\H\E\`   | the text `\H\`     | `\H\`             |
| `\E\.br\E\` | the text `\.br\`   | `\E\.br\E\`       |

Each row where the last column differs from the first is a change glion makes to the text. Steps 9 to 13 explain them.

## Step 9: Three kinds of sequence

The sequences do three different jobs.

- **A character.** `\F\`, `\S\`, `\T\`, `\R\`, `\E\` and `\P\` each stand for one character of the value. Reading the sequence gives back that character, and the value is the same text whatever system displays it.
- **Markup.** `\H\`, `\N\` and the formatting commands of §2.7.7 are not characters. `\H\240*\N\` is the three characters `240*` with an instruction to make them stand out. §2.7.4 leaves how to the receiver: "reverse video, boldface, underlining, blink, an alternate color". `\.br\` is markup too: §2.7.7 says it begins a new output line, not that the value holds a carriage return.
- **By agreement.** `\Xdd…\` and `\Z…\` mean whatever sender and receiver agree on, "beyond the scope of this Standard" (§2.7.6, §2.7.8). `\C…\` and `\M…\` change how the characters that follow are read.

The specification of part 1 has only the first kind, without `\P\`, because its delimiters have no truncation character. A value is a `List Char`, so it has nowhere to put markup. glion's tree has the same shape: a subcomponent's value is a string. glion keeps markup by leaving the sequence in that string as text.

## Step 10: A value that holds markup

To model markup, a value has to hold two kinds of piece. Add this to `Lesson6.lean`:

```lean
inductive Piece where
  | char (c : Char)
  | mark (code : List Char)
  deriving DecidableEq, Repr

def writePiece (d : Delimiters) : Piece → List Char
  | .char c => escapeChar d c
  | .mark code => d.escape :: code ++ [d.escape]

def writeValue (d : Delimiters) (v : List Piece) : List Char :=
  v.flatMap (writePiece d)
```

A `char` is written through `escapeChar` from step 2. A `mark` is written as its code between two escape characters. `writeValue` has the same shape as `escape`. With it, the data `\H\` and the command `\H\` are two different values, and they are written as two different texts:

```lean
def dataH : List Piece := [.char '\\', .char 'H', .char '\\']
def markH : List Piece := [.mark ['H']]

#eval String.ofList (writeValue Delimiters.suggested dataH)   -- "\\E\\H\\E\\"
#eval String.ofList (writeValue Delimiters.suggested markH)   -- "\\H\\"
```

Figure 2-3 of §2.7.7, shortened, is a list of pieces too:

```lean
def impression : List Piece :=
  [.mark ".in+4".toList, .char '1', .char '.', .mark ".br".toList, .char '2', .char '.', .mark ".in-4".toList]

#eval String.ofList (writeValue Delimiters.suggested impression)   -- "\\.in+4\\1.\\.br\\2.\\.in-4\\"
```

## Step 11: glion's value as a string

glion's tree flattens a list of pieces into one string: a character goes in as itself, and a mark goes in as its sequence. Model that, then compare the two values of step 10:

```lean
def flatten (d : Delimiters) : Piece → List Char
  | .char c => [c]
  | .mark code => d.escape :: code ++ [d.escape]

def glionValue (d : Delimiters) (v : List Piece) : List Char :=
  v.flatMap (flatten d)

theorem glionValue_collides :
    dataH ≠ markH ∧ glionValue Delimiters.suggested dataH = glionValue Delimiters.suggested markH := by
  decide
```

Two different values give one string. This is lesson 1's `ambiguous_without_distinct_delimiters` again, one level down. There, two messages shared a text because two delimiters were the same character. Here, two values share a tree because data and markup are written with the same characters. Whatever the serializer does with the string `\H\`, it is wrong for one of the two values. glion writes it as markup, so the data `\H\` is lost, which is the finding of step 7.

## Step 12: Reading it back

Part 1 proved `unescape_escape`: writing a value and reading it back gives the value. For pieces, the reader has to find where a sequence ends, because a mark's code can be any length. It reads from one escape character to the next:

```lean
def readCode (d : Delimiters) : List Char → Piece
  | [c] => if c ∈ escapeCodes then .char (unescapeCode d c) else .mark [c]
  | code => .mark code

def readAux (d : Delimiters) : Option (List Char) → List Char → List Piece
  | none, [] => []
  | some code, [] => .char d.escape :: code.map .char
  | none, c :: rest =>
    if c = d.escape then readAux d (some []) rest else .char c :: readAux d none rest
  | some code, c :: rest =>
    if c = d.escape then readCode d code :: readAux d none rest
    else readAux d (some (code ++ [c])) rest

def readValue (d : Delimiters) (text : List Char) : List Piece := readAux d none text

#eval readValue Delimiters.suggested "\\H\\240*\\N\\".toList
-- [Piece.mark ['H'], Piece.char '2', Piece.char '4', Piece.char '0', Piece.char '*', Piece.mark ['N']]
```

`readAux` carries the code read so far: `none` outside a sequence, `some code` inside one. A code of one letter among `F`, `S`, `T`, `R`, `E` is a character; any other code is a mark. An escape character with no closing one is data.

The round trip holds under two conditions:

```lean
def MarkOK (d : Delimiters) (code : List Char) : Prop :=
  d.escape ∉ code ∧ ∀ c ∈ escapeCodes, code ≠ [c]
```

```text
theorem readValue_writeValue (d : Delimiters) (he : d.escape ∉ escapeCodes)
    (v : List Piece) (hv : ∀ code, Piece.mark code ∈ v → MarkOK d code) :
    readValue d (writeValue d v) = v
```

- **`MarkOK`:** a mark's code holds no escape character, which is §2.7.1's "SHALL NOT contain nested escape sequences", and is not one of the five code letters on its own, since `\F\` is the field separator and not a command.
- **`he`:** the escape character is not a code letter. Part 1's `unescape` takes the two characters after an escape character without looking at them, so it never needed this. `readAux` looks for the closing escape character, so with `F` as the escape character it reads `\F\`, written `FFF`, as an empty code followed by an `F`. This is a new rule next to `well_formed_separators_not_escape_codes`: together they keep all five delimiters off the code letters.

<details><summary>The proof (about 60 lines)</summary>

Two lemmas, then the theorem by induction, as `unescape_escape` was. `readAux_code` reads a mark's code up to its closing escape character. `readValue_writePiece` reads back one piece, with one case per branch of `escapeChar` and one for a mark.

```lean
theorem readAux_code (d : Delimiters) (acc code t : List Char) (h : d.escape ∉ code) :
    readAux d (some acc) (code ++ d.escape :: t) = readCode d (acc ++ code) :: readAux d none t := by
  induction code generalizing acc with
  | nil => simp [readAux]
  | cons c cs ih =>
    simp only [List.mem_cons, not_or] at h
    simp only [List.cons_append, readAux, Ne.symm h.1, ite_false]
    rw [ih _ h.2]
    simp

theorem readValue_writePiece (d : Delimiters) (he : d.escape ∉ escapeCodes)
    (p : Piece) (hp : ∀ code, p = .mark code → MarkOK d code) (t : List Char) :
    readAux d none (writePiece d p ++ t) = p :: readAux d none t := by
  have hF : 'F' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hS : 'S' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hT : 'T' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hR : 'R' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hE : 'E' ≠ d.escape := fun h => he (by rw [← h]; decide)
  cases p with
  | char c =>
    simp only [writePiece, escapeChar]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    · simp [readAux, *]
  | mark code =>
    obtain ⟨hn, hc⟩ := hp code rfl
    have : writePiece d (.mark code) ++ t = d.escape :: (code ++ d.escape :: t) := by
      simp [writePiece]
    rw [this]
    simp only [readAux, ite_true]
    rw [readAux_code d [] code t hn]
    congr 1
    simp only [List.nil_append, readCode]
    split
    · rename_i c
      have : c ∉ escapeCodes := fun hm => hc c hm rfl
      simp [this]
    · rfl

theorem readValue_writeValue (d : Delimiters) (he : d.escape ∉ escapeCodes)
    (v : List Piece) (hv : ∀ code, Piece.mark code ∈ v → MarkOK d code) :
    readValue d (writeValue d v) = v := by
  induction v with
  | nil => rfl
  | cons p ps ih =>
    simp only [readValue, writeValue, List.flatMap_cons] at ih ⊢
    rw [readValue_writePiece d he p (fun code h => hv code (by simp [h])),
      ih (fun code h => hv code (List.mem_cons_of_mem _ h))]

#print axioms readValue_writeValue   -- [propext]
```

</details>

`readValue_writeValue` gives what `glionValue` cannot: two values with good marks never share a text, because `readValue` tells them apart. glion's string has no `readValue`, by `glionValue_collides`.

## Step 13: glion's differences, by cause

Each row of step 8 where glion writes back a different text has one of three causes.

**Data and markup share the string.** `\E\H\E\` is written back as `\H\`, and `\E\.sp\E\` as `\.sp\`. In the model, the tree holds `glionValue dataH`, which is also `glionValue markH`, and the serializer picks `markH`. Step 11 is this cause.

**A mark glion does not know becomes data.** `\P\`, `\XFF\` and `\Q\` are written back as `\E\P\E\`, `\E\XFF\E\` and `\E\Q\E\`. The decoder keeps each one as text, as it keeps `\H\`. The encoder recognises markup by a fixed list (`VERBATIM_SEQUENCE` in `escape-encoding.ts`), and none of the three is on it, so each is escaped as data. The receiver of `abcde\E\P\E\` reads the eight characters `abcde\P\`, not a value truncated by the sender. In the model, `readValue` turns every code that is not a character into a mark, whatever its letters, so nothing is lost on the way back. `\P\` is a mark there too, since the model's delimiters have no truncation character; either way it is not data.

**A mark and a character trade places.** `\.br\` becomes a carriage return in the tree, and a carriage return is written as `\.br\`. So `\X0D\`, a byte of data under glion's UTF-8 agreement, comes back as a formatting command. In the model `\.br\` is a mark and the carriage return a character, and the two are different values:

```lean
def brData : List Piece := [.char 'a', .char '\r', .char 'b']
def brMark : List Piece := [.char 'a', .mark ".br".toList, .char 'b']

#eval String.ofList (writeValue Delimiters.suggested brData)   -- "a\x0db"
#eval String.ofList (writeValue Delimiters.suggested brMark)   -- "a\\.br\\b"
```

`brData` breaks `well_formed_subcomponent_no_terminator`, as in part 1: `escapeChar` has no sequence for a carriage return. Writing it as `\X0D\` is a choice that relies on the agreement of §2.7.6, and the specification does not make that choice yet.

One row is not a difference in value: `caf\XC3A9\` is written back as `café`. Under glion's agreement that `\X…\` holds UTF-8 bytes (#659), the value is the same, and only the text changes.

**What this means for glion.** The model says what a tree needs for the serializer to write back what the parser read:

- The tree holds a mark apart from the characters around it, so `\E\H\E\` and `\H\` are two different trees.
- The parser reads every code that is not a character escape as a mark, whatever its letters, and the serializer writes a mark as its code between escape characters. No fixed list of known commands is needed to round-trip.
- `\.br\` is a mark. Whether a carriage return in data is written `\X0D\` is a separate choice about §2.7.6.

That is a change to `@glion/ast`, `@glion/parser` and `@glion/to-hl7v2`. The matching change to the specification turns a subcomponent from `List Char` into `List Piece`, adds `MarkOK` and the escape character rule to `Message.WF`, and proves `decode_encode` with `readValue_writeValue` in place of `unescape_escape`. The abstraction function would then map glion's marks to `.mark`, and the generator could draw marks of any letters.

## What you can now say

- **The model:** a delimiter in data is written as one of the five sequences of §2.7.1, and the escape character as `\E\`, so no value holds markup.
- **The rules:** a value may hold any delimiter but `\r`, and no separator may be an escape code letter.
- **The review:** the theorems' statements did not change, but what `encode` and `Message.WF` mean did, and that is what a person reviews.
- **The proof:** one device (`unescape`) and three lemmas; the shape of `decode_encode` stayed the same.
- **The kinds:** §2.7's sequences stand for a character (`\F\` … `\P\`), for markup (`\H\`, `\N\`, the formatting commands, `\.br\` included), or for something sender and receiver agree on (`\X\`, `\Z\`, `\C\`, `\M\`).
- **The collision:** a value held as a string cannot tell data from markup (`glionValue_collides`); a value held as pieces can (`readValue_writeValue`), as long as no code nests an escape character and the escape character is not a code letter.
- **glion:** each change glion makes to a text comes from one of three causes: data and markup share the string, an unknown mark becomes data, or `\.br\` and the carriage return trade places.

## Exercises

**1. Predict, then run.** What does `escape Delimiters.suggested "~&\\".toList` write? And `escape sField "S".toList`?

<details><summary>Answer</summary>

`\R\\T\\E\`: each of the three characters is a delimiter. `S` with `sField` is the field separator, so it is written `\F\`, though the message breaks `well_formed_separators_not_escape_codes`. `escape` writes text for any message, well formed or not, as `encode` does.

</details>

**2. Break the encoding.** In `Spec/Escape.lean`, make `escapeChar` write `'T'` for the component separator instead of `'S'`. Run `lake build`. Which lemma fails, and why does it fail there and not in `decode_encode`?

<details><summary>Answer</summary>

`unescape_escapeChar_append` fails, in the component case: `unescapeCode d 'T'` is the subcomponent separator, not the component separator, so reading back `\T\` doesn't give `^`. `decode_encode` only uses the lemma, so the error appears where the fact is proved, not where it is used. (`not_mem_escape` also reports an error in that branch, because its `simp` call names `'S'`.)

</details>

**3. Is the rule needed?** `caret` shows that `decode` cannot read a message with `S` as the field separator. Does that mean two well-formed messages could share a text without `well_formed_separators_not_escape_codes`? Try to build two such messages before you answer.

<details><summary>Things to weigh</summary>

`decode` failing is not the same as `encode` being ambiguous. `escape` writes every `\` in data as `\E\`, so a lone `\` on the wire always belongs to a sequence, and a smarter decoder could read escape sequences before splitting. The rule makes the proof's decoder, which splits first like a receiver, correct. Whether `encode_injective` holds without it is an open question; proving it would need a different decoder.

</details>

**4. Drop a condition.** Take `fEscape := { Delimiters.suggested with escape := 'F' }`. Predict `readValue fEscape (writeValue fEscape [.char '|'])`, then run it. Which hypothesis of `readValue_writeValue` does `fEscape` break?

<details><summary>Answer</summary>

`[Piece.mark [], Piece.char 'F']`. The `|` is written `FFF`. `readAux` opens a sequence at the first `F`, closes it at the second with an empty code, and reads the third as data. `fEscape` breaks `he`: its escape character `F` is a code letter.

</details>

**5. Break `MarkOK`.** Predict what `readValue Delimiters.suggested` gives back for `writeValue Delimiters.suggested [.mark ['F']]` and for `writeValue Delimiters.suggested [.mark ['a', '\\', 'b']]`. Which half of `MarkOK` does each break?

<details><summary>Answer</summary>

`[Piece.char '|']`: the mark `F` is written `\F\`, which is the field separator. It breaks the second half. `[Piece.mark ['a'], Piece.char 'b', Piece.char '\\']`: the code holds an escape character, so the sequence ends early at it, and the last escape character has no closing one, so it is data. It breaks the first half, §2.7.1's rule against nesting.

</details>

**6. Round-trip a figure.** Write the first line of Figure 2-3 in §2.7.7, `\.in+4\\.ti-4\ 1. The cardiomediastinal silhouette is now within normal limits.\.br\`, as a `List Piece`. Check with `#eval` that `readValue` gives it back. What would glion's tree hold for it, and what would change if the line contained the data `\.br\`?

<details><summary>Answer</summary>

Three marks (`.in+4`, `.ti-4`, `.br`) around the characters of the sentence, and comparing `readValue` of its text with the list prints `true`. glion's tree holds one string: the two indent commands as text, and a carriage return for `\.br\`. The data `\.br\` is written `\E\.br\E\`, and glion keeps it apart from the command, because the command became a carriage return and the data stayed text. That is the one formatting command for which `\E\…\E\` round-trips in glion today, as the last row of step 8 shows.

</details>

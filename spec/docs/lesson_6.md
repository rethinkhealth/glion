# Lesson 6: Escape sequences, from prose to a proved model

Lessons 1 to 5 read a specification that already existed. This lesson builds a part of it: §2.7 of HL7v2, "Use of escape sequences in fields", taken from the standard's prose to definitions, rules, a reviewed statement, a proof, and a comparison with glion. Each stage of the method has its own question:

| Stage                     | Question                                                      | Sections |
| ------------------------- | ------------------------------------------------------------- | -------- |
| Read the standard         | What does the text say, and what kinds of thing does it name? | 1–2      |
| Choose a representation   | What is a value, so that every meaning has exactly one?       | 3–4      |
| Define                    | How does a sender write a value?                              | 5–8      |
| State side conditions     | Which messages must be excluded, and why each one?            | 9        |
| Review the statement      | What does the theorem mean now?                               | 10       |
| Prove                     | Why is the encoding unambiguous?                              | 11–14    |
| Compare an implementation | Where does glion differ, and why?                             | 15–17    |

You need lessons 1 to 4 (reading Lean, rules as decidable propositions, the structure of `decode_encode`) and lesson 5's harness.

Create `Hl7v2/Lesson6.lean`, start it with these lines, and paste each `lean` block below them, in order:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm
```

# Part I: The standard

## 1. What §2.7 says

§2.7.1 defines the form of every sequence:

> An escape sequence consists of the escape character followed by an escape code ID of one character, zero (0) or more data characters, and another occurrence of the escape character.

It then lists six sequences any field may use, and four more for the text data types:

> When a field, component or sub-component of type TX, FT, or CF is being encoded, additional escape character(s) may be used to signal certain special characteristics of portions of the text field.

The later subsections add character sets (§2.7.3) and the formatting commands of formatted text (§2.7.7). One sentence of §2.7.1 constrains them all:

> Escape sequences SHALL NOT contain nested escape sequences.

The whole catalogue, with `\` as the escape character:

| Sequence                                                        | Section        | Data types | Stands for                          |
| --------------------------------------------------------------- | -------------- | ---------- | ----------------------------------- |
| `\F\` `\S\` `\T\` `\R\` `\E\`                                   | §2.7.1, §2.7.5 | all        | a delimiter                         |
| `\P\`                                                           | §2.7.2         | all        | the truncation character            |
| `\Cxxyy\` `\Mxxyyzz\`                                           | §2.7.3         | FT, ST, TX | a switch to another character set   |
| `\H\` `\N\`                                                     | §2.7.4         | TX, FT, CF | start and end highlighting          |
| `\Xdd…\`                                                        | §2.7.6         | TX, FT, CF | hexadecimal data, read by agreement |
| `\.sp\` `\.br\` `\.fi\` `\.nf\` `\.in\` `\.ti\` `\.sk\` `\.ce\` | §2.7.7         | FT         | a formatting command                |
| `\Z…\`                                                          | §2.7.8         | TX, FT, CF | locally defined, read by agreement  |

## 2. Three kinds of sequence

The table mixes three different jobs, and a model has to tell them apart.

- **A character.** `\F\`, `\S\`, `\T\`, `\R\`, `\E\` and `\P\` each stand for one character of the value. They exist because that character would otherwise be read as structure. `SMITH\T\JONES` is the value `SMITH&JONES`.
- **Markup.** `\H\`, `\N\` and the formatting commands are not characters. `\H\240*\N\` is the four characters `240*` with an instruction to make them stand out, and §2.7.4 leaves the how to the receiver: "reverse video, boldface, underlining, blink, an alternate color". `\.br\` belongs here too: §2.7.7 defines it as "Begin new output line", an instruction for display, not a carriage return in the value.
- **By agreement.** `\X…\` and `\Z…\` mean what sender and receiver agree on, "beyond the scope of this Standard" (§2.7.6, §2.7.8). `\C…\` and `\M…\` change how the characters after them are read.

An agreement can move a sequence from the third kind to the first. The specification adopts the one glion uses (#659): a message is UTF-8. Under it, `\X41\` is the byte 0x41, which is the character `A`, so hexadecimal data is a way of writing characters, like `\F\`. Section 7 shows what that does to the model.

The distinction that matters for a model: a sequence of the first kind is **how a value is written**; a sequence of the other two kinds is **part of what the value is**. `\F\` disappears when a receiver reads the value. `\H\` does not: it is information the sender meant to send.

# Part II: Choosing a representation

## 3. What makes a representation right

Every formalization starts by deciding what its objects are. Here the object is a value, and `encode` maps values to text. Three properties judge a choice:

1. **Expressive.** Every value the standard can send has a representation. A model that cannot hold `\H\` cannot describe a lab report that uses it.
2. **No confusion.** Two different meanings never share a representation. If they do, no encoding can write both correctly.
3. **No junk.** Two representations never share a meaning, or a rule excludes all but one. Otherwise `encode` sends two representations to one text, and `encode_injective` is false.

The last two are a slogan of algebraic specification, "no junk, no confusion", from the work of Burstall and Goguen: a model should contain exactly the values the theory describes, each once.

## 4. Four candidates

| Representation of a value                  | Expressive                  | No confusion | No junk                      | Where                         |
| ------------------------------------------ | --------------------------- | ------------ | ---------------------------- | ----------------------------- |
| Characters; delimiters forbidden in data   | No: no delimiter, no markup | Yes          | Yes                          | This spec, lessons 1–4        |
| Characters; the five delimiter sequences   | No markup                   | Yes          | Yes                          | This spec, before this lesson |
| One string, markup kept as its text        | Yes                         | **No**       | Yes                          | glion's tree                  |
| A list of pieces: characters and sequences | Yes                         | Yes          | Only with a rule (section 9) | This spec now                 |

The third row is glion. Its tree holds a value as one string: decoded characters, and every sequence it does not decode left as its text. The data `\H\` (sent `\E\H\E\`) and the command `\H\` become the same string. Section 15 proves it.

The fourth row is the choice this specification makes. A value is a list of pieces, each a character or a sequence. It is expressive, and it has no confusion by construction. It has junk: the piece `sequence F` and the character `|` both mean the field separator. Section 9 shows the rule that removes it.

# Part III: The model

## 5. Pieces

`Spec/Escape.lean` defines the piece:

```text
inductive Piece where
  | char (c : Char)
  | sequence (code : List Char)
```

`code` holds the escape code ID and the data characters: `['H']` for `\H\`, `".sp 2".toList` for `\.sp 2\`. A subcomponent is now `List Piece` (`Spec/Message.lean`), and `data` builds a value of characters only:

```lean
def highlighted : List Piece := [.sequence ['H']] ++ data "240*" ++ [.sequence ['N']]
```

`highlighted` is `\H\240*\N\` from §2.7.4. Only the five delimiter sequences have no piece of their own: they are characters, and `escape` writes them.

## 6. Writing a value

Three definitions, each one level up:

```text
def escapeChar (d : Delimiters) (c : Char) : List Char :=
  if c = d.field then [d.escape, 'F', d.escape]
  else if c = d.component then [d.escape, 'S', d.escape]
  else if c = d.subcomponent then [d.escape, 'T', d.escape]
  else if c = d.repetition then [d.escape, 'R', d.escape]
  else if c = d.escape then [d.escape, 'E', d.escape]
  else [c]

def escapePiece (d : Delimiters) : Piece → List Char
  | .char c => escapeChar d c
  | .sequence code => d.escape :: code ++ [d.escape]

def escape (d : Delimiters) (value : List Piece) : List Char :=
  value.flatMap (escapePiece d)
```

A character that is a delimiter becomes its sequence; any other character stays. A sequence is written as its code between two escape characters. Run them:

```lean
#eval escapeChar Delimiters.suggested '&'                                -- ['\\', 'T', '\\']
#eval String.ofList (escape Delimiters.suggested (data "SMITH&JONES"))  -- "SMITH\\T\\JONES"
#eval String.ofList (escape Delimiters.suggested highlighted)           -- "\\H\\240*\\N\\"
#eval String.ofList (escape Delimiters.suggested (data "\\H\\"))        -- "\\E\\H\\E\\"
```

`#eval` prints a string with its backslashes doubled. The last two lines are the point of the representation: the command `\H\` and the data `\H\` are two values, written as two texts.

## 7. Which sequences exist

`isDefinedSequence` says which codes §2.7.2 to §2.7.8 define. Read it against the table of section 1, one line per row:

```text
def isDefinedSequence : List Char → Bool
  | ['P'] | ['H'] | ['N'] => true
  | 'C' :: ds => ds.length == 4 && ds.all isHexDigit
  | 'M' :: ds => (ds.length == 4 || ds.length == 6) && ds.all isHexDigit
  | 'Z' :: _ => true
  | '.' :: command => isFormattingCommand command
  | _ => false
```

`isFormattingCommand` accepts the eight commands of §2.7.7: `.sp` and `.sk` with an optional count, `.in` and `.ti` with a signed number, and `.br`, `.fi`, `.nf` and `.ce` with none, each argument after an optional space.

```lean
#eval ["P", "H", "N", "C2D41", "M2442", "Zab", ".br", ".sp", ".sp 2", ".in+4", ".ti-4", ".ce"].map (isDefinedSequence ·.toList)
-- [true, true, true, true, true, true, true, true, true, true, true, true]
#eval ["F", "X41", "Q", "C2D4", "C2d41", ".sp x", ".in", ".xx", "", "Z|"].map (isDefinedSequence ·.toList)
-- [false, false, false, false, false, false, false, false, false, true]
```

`F` is false on purpose: the five delimiter codes are characters, not sequences. `X41` is false for the same reason, by the agreement of section 2: hexadecimal data is characters, so a value holds `A` and never the piece `\X41\`. A sender writes `A`, and a receiver that reads `\X41\` reads `A`. §2.7.6 leaves this choice open, so the README records it with the specification's other decisions. `C2d41` is false because §2.7.6 lists the hexadecimal digits as "0, 1, . . . , 9, A, . . . , F", in uppercase. `Z|` is true here: whether a sequence may hold a delimiter is a separate rule (section 9).

A formalization must also say what it leaves out, and this one does (README, "Not yet covered"): which data types may use which sequence, because a message here has no data types; and where in a line `\.in\` and `\.ti\` may stand.

## 8. Encoding a message

One line of `Spec/Encoding.lean` uses `escape`: `encodeField` joins the subcomponents of a component, each written through it.

```text
[d.subcomponent].intercalate (c.map (escape d))
```

```lean
def oneValue : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[data "a|b"]]]]⟩]⟩
def twoFields : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[data "a"]]], [[[data "b"]]]]⟩]⟩
def report : Message := ⟨Delimiters.suggested, [], [⟨"OBX".toList, [[[[highlighted, data "\\H\\"]]]]⟩]⟩

#eval String.ofList (encode oneValue)      -- "MSH|^~\\&\x0dPID|a\\F\\b\x0d"
#eval encode oneValue == encode twoFields  -- false
#eval String.ofList (encode report)        -- "MSH|^~\\&\x0dOBX|\\H\\240*\\N\\&\\E\\H\\E\\\x0d"
#eval report.failures                      -- []
```

`report` holds the highlighted `240*` and the data `\H\` in two subcomponents, and both survive into the text.

# Part IV: Side conditions

## 9. Where each rule comes from

`encode` writes text for any message, but `encode_injective` holds only for well-formed ones. A side condition has one of two sources, and the difference matters when a reviewer asks whether it belongs:

- **The standard says so.** The rule restates a sentence of §2.7.
- **The theorem needs it.** Without the rule, a counterexample exists: either to `encode_injective` (two messages, one text) or to `decode_encode` (the receiver's reading, which splits first and decodes after, gets the message wrong).

A counterexample is the stronger justification: it shows the rule is necessary. When only `decode_encode` fails, the rule is necessary for a receiver that reads as §2.6 describes, but perhaps not for injectivity itself. Exercise 7 asks which.

The four rules about values, one at a time:

**`well_formed_subcomponent_no_terminator`: no carriage return in data.** No sequence of §2.7 stands for one in the model: `\.br\` is markup, and `\X0D\` is, by the agreement of section 2, this very character, so the rule excludes it in either form. Without the rule, two messages share a text:

```lean
def oneSegment : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[data "a\rPV1"]]]]⟩]⟩
def twoSegments : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[data "a"]]]]⟩, ⟨"PV1".toList, []⟩]⟩

example : encode oneSegment = encode twoSegments ∧ oneSegment ≠ twoSegments := by decide
#eval oneSegment.failures   -- ["well_formed_subcomponent_no_terminator"]
```

**`well_formed_escape_sequence_defined`: every sequence is one §2.7 defines.** The standard's list is closed ("The following escape sequences are defined"), and the theorem needs the rule: this is the junk of section 4.

```lean
def pipeAsData : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[[.char '|']]]]]⟩]⟩
def pipeAsSequence : Message := ⟨Delimiters.suggested, [], [⟨"PID".toList, [[[[[.sequence ['F']]]]]]⟩]⟩

example : encode pipeAsData = encode pipeAsSequence ∧ pipeAsData ≠ pipeAsSequence := by decide
#eval pipeAsSequence.failures   -- ["well_formed_escape_sequence_defined"]
```

Both are written `PID|\F\`. The rule keeps `pipeAsData` and excludes `pipeAsSequence`, so the field separator in data has one representation.

**`well_formed_escape_sequence_no_delimiter`: no sequence holds a delimiter.** The standard's "SHALL NOT contain nested escape sequences" excludes the escape character. A separator inside a sequence would end the field before a receiver reaches the closing escape character:

```lean
def splitLocal : Message := ⟨Delimiters.suggested, [], [⟨"ZZZ".toList, [[[[[.sequence "Za|b".toList]]]]]⟩]⟩

#eval String.ofList (encode splitLocal)         -- "MSH|^~\\&\x0dZZZ|\\Za|b\\\x0d"
#eval decode (encode splitLocal) == splitLocal  -- false
#eval splitLocal.failures                       -- ["well_formed_escape_sequence_no_delimiter"]
```

`decode` reads two fields, `\Za` and `b\`, each as data. This is a counterexample to `decode_encode`, not to `encode_injective`.

**`well_formed_delimiters_not_escape_codes`: no delimiter is `F`, `S`, `T`, `R` or `E`.** The standard allows letters as delimiters, so this rule is the specification's decision, and the README records it. With `S` as the field separator, `\S\` splits where it stands:

```lean
def sField : Delimiters := { Delimiters.suggested with field := 'S' }
def caret : Message := ⟨sField, [], [⟨"PID".toList, [[[[data "^"]]]]⟩]⟩

#eval String.ofList (encode caret)   -- "MSHS^~\\&\x0dPIDS\\S\\\x0d"
#eval (decode (encode caret)).segments.map (·.fields)
-- [[[[[[Hl7v2.Spec.Piece.char '\\']]]], [[[[Hl7v2.Spec.Piece.char '\\']]]]]]
#eval caret.failures                 -- ["well_formed_delimiters_not_escape_codes"]
```

One field holding `^` is read back as two fields, each holding a lone `\`. The rule covers the escape character as well as the separators; section 14 shows how the proof found that case.

The catalogue now has ten rules: these four, `delimiters_distinct`, the two segment ID rules, and the three rules that no level of a field is an empty list.

```lean
#eval catalogue.length   -- 10
```

# Part V: Reviewing the statement

## 10. What a reviewer sees

`Statements.lean` records each headline theorem's statement, its axioms, and the rule names. After this change, two of its guards failed, and their diff is what a person reviews.

The rule list:

```text
- "well_formed_delimiters_distinct", "well_formed_separators_not_escape_codes", …,
-  "well_formed_component_has_subcomponent", "well_formed_subcomponent_no_terminator"]
+ "well_formed_delimiters_distinct", "well_formed_delimiters_not_escape_codes", …,
+  "well_formed_component_has_subcomponent", "well_formed_subcomponent_no_terminator",
+  "well_formed_escape_sequence_defined", "well_formed_escape_sequence_no_delimiter"]
```

And `ambiguous_without_distinct_delimiters`, whose values are now pieces:

```text
-   fields := [[[[['a']], [['b']]]]]
+   fields := [[[[[Piece.char 'a']], [[Piece.char 'b']]]]]
```

`encode_injective` reads the same, and its axioms are still `propext` and `Quot.sound`. Its meaning changed in two directions: it now covers every message with markup, which the old model could not hold, and it no longer covers messages whose escape character is a code letter. The reviewer's questions are those of sections 3 and 9: does `escape` write what §2.7 says, and does each new rule exclude only what must be excluded? Whether the proof goes through is Lean's job.

# Part VI: The proof

## 11. Strategy: a left inverse

`encode_injective` is proved in one line from `decode_encode`:

```text
theorem encode_injective (h₁ : m₁.WF) (h₂ : m₂.WF) (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]
```

If some `decode` undoes `encode` on well-formed messages, two messages with the same text are the same message. Proving a left inverse is easier than proving injectivity directly: it is a computation, and each level of the message is proved on its own. `decode` exists only to carry this proof; it is not part of the specification.

For values, the left inverse is `unescape`, and the lemma to prove is `unescape_escape`:

```lean
#check @unescape_escape
```

```text
unescape_escape : ∀ (d : Delimiters), ¬d.escape ∈ escapeCodes →
  ∀ (v : List Piece), (∀ (p : Piece), p ∈ v → p.isDefined = true ∧ Piece.NoDelimiter d p) →
    unescape d (escape d v) = v
```

## 12. The reader

The previous reader took the two characters after an escape character without looking at them, which worked because every code had one letter. A code is now any length, so the reader must find the closing escape character. It is a small state machine, in `Thm/Encoding/Escape.lean`:

```text
def readAux (d : Delimiters) : Option (List Char) → List Char → List Piece
  | none, [] => []
  | some code, [] => .char d.escape :: code.map .char
  | none, c :: rest =>
    if c = d.escape then readAux d (some []) rest else .char c :: readAux d none rest
  | some code, c :: rest =>
    if c = d.escape then readCode d code :: readAux d none rest
    else readAux d (some (code ++ [c])) rest

def unescape (d : Delimiters) (text : List Char) : List Piece := readAux d none text
```

The state is `none` outside a sequence and `some code` inside one, holding the code read so far. At the closing escape character, `readCode` decides: a one-letter code among `F`, `S`, `T`, `R`, `E` is a character (`unescapeCode` gives the delimiter), and any other code is a sequence. An escape character with no closing one is data. Written this way, the reader is structurally recursive on the text, so Lean accepts it without a termination proof.

```lean
#eval unescape Delimiters.suggested "\\H\\240*\\N\\".toList == highlighted   -- true
#eval unescape Delimiters.suggested "a\\b".toList == data "a\\b"             -- true
```

## 13. The lemmas, in dependency order

| Lemma                              | Says                                                                            | Uses                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `readAux_code`                     | Inside a sequence, the reader reads the code up to the closing escape character | The code holds no escape character                                                                      |
| `isDefinedSequence_not_escapeCode` | A one-letter code among `F`, `S`, `T`, `R`, `E` is not a defined sequence       | `decide`, five cases                                                                                    |
| `unescape_escapePiece_append`      | Reading one written piece followed by any text gives the piece first            | The two above, and the escape character is not a code letter                                            |
| `unescape_escape`                  | `unescape d (escape d v) = v`                                                   | Induction on `v`, with the lemma above                                                                  |
| `not_mem_escape`                   | No separator appears in a written value                                         | Distinct delimiters, no delimiter a code letter, no carriage return in data, no delimiter in a sequence |

Two techniques carry the proof, and both recur in proofs about any parser.

**Generalize the accumulator.** `readAux_code` is stated for any code already read, `acc`, not just the empty one. The induction step reads one more character into `acc`, so a hypothesis fixed at `[]` would not apply. This is the `induction code generalizing acc` line.

**State it with a tail.** `unescape_escapePiece_append` says what the reader does with `escapePiece d p ++ t` for any `t`, not with `escapePiece d p` alone. The reader never sees a piece in isolation; it sees a piece followed by the rest of the value. With the tail in the statement, the induction in `unescape_escape` is one rewrite per piece.

`not_mem_escape` connects values to fields. `decode` splits a field at its separators before it reads any value, as a receiver does, and splitting undoes joining only when no separator occurs inside a part (`map_splitOn_intercalate`, lesson 4's appendix). So the proof needs no written value to contain a separator, and that lemma is where `escape_sequence_no_delimiter` and the separator half of `delimiters_not_escape_codes` are used.

## 14. A rule the proof found

The first draft of the rules said only that no **separator** is a code letter, as the specification said before this lesson. The proof of `unescape_escapePiece_append` then stopped in the character case: to read `\F\` back, the reader must see `F` as the code and not as the closing escape character, which needs `'F' ≠ d.escape`. Nothing gave it. The counterexample is short:

```lean
def fEscape : Delimiters := { Delimiters.suggested with escape := 'F' }

#eval String.ofList (escape fEscape (data "|"))     -- "FFF"
#eval unescape fEscape (escape fEscape (data "|"))  -- [Hl7v2.Spec.Piece.sequence [], Hl7v2.Spec.Piece.char 'F']
```

`|` is written `FFF`. The reader opens a sequence at the first `F`, closes it at the second with an empty code, and reads the third as data. So the rule became "no **delimiter** is a code letter". The old reader never needed it, because it did not look for the end of a sequence.

This is how side conditions are usually found: not by reading the standard more closely, but by a proof that cannot continue. The goal Lean cannot close names the missing fact, and a small counterexample confirms the fact is needed.

# Part VII: glion against the model

## 15. glion's representation, formally

glion's tree flattens a value into one string: a character goes in as itself, and a sequence goes in as its text. Model that, and prove the confusion of section 4:

```lean
def glionPiece (d : Delimiters) : Piece → List Char
  | .char c => [c]
  | .sequence code => d.escape :: code ++ [d.escape]

def glionValue (d : Delimiters) (v : List Piece) : List Char := v.flatMap (glionPiece d)

theorem glionValue_collides :
    data "\\H\\" ≠ [.sequence ['H']] ∧
      glionValue Delimiters.suggested (data "\\H\\") = glionValue Delimiters.suggested [.sequence ['H']] := by
  decide
```

Two different values, one string. Whatever `@glion/to-hl7v2` writes for the string `\H\`, it is wrong for one of them. This is lesson 1's `ambiguous_without_distinct_delimiters` one level down: there, two messages shared a text; here, two values share a tree.

The same happens with `\.br\`, which glion decodes to a carriage return:

```lean
def brData : List Piece := data "a\rb"
def brMark : List Piece := data "a" ++ [.sequence ".br".toList] ++ data "b"

#eval String.ofList (escape Delimiters.suggested brMark)                                   -- "a\\.br\\b"
#eval glionValue Delimiters.suggested brData == glionValue Delimiters.suggested brMark     -- false
```

In the model, `brMark` is markup, and `brData` breaks `well_formed_subcomponent_no_terminator`. glion's flattening keeps them apart (`false`), but its parser puts a carriage return in the tree for `\.br\`, so in glion's actual tree both are `a`, carriage return, `b`. Section 16 shows what that does.

## 16. What glion does to each sequence

Each row was run through `@glion/parser` and `@glion/to-hl7v2` with `|^~\&`:

| Received                              | glion's tree holds        | Written back   | Same text                  |
| ------------------------------------- | ------------------------- | -------------- | -------------------------- |
| `a\F\b` (and `\S\` `\T\` `\R\` `\E\`) | the delimiter             | the same       | yes                        |
| `\H\240*\N\`                          | the text `\H\240*\N\`     | the same       | yes                        |
| `\.sp 2\`, `\.in+4\`, …               | the text                  | the same       | yes                        |
| `\Zab\`, `\C2D41\`, `\M2442\`         | the text                  | the same       | yes                        |
| `a\.br\b`                             | `a`, carriage return, `b` | `a\.br\b`      | yes                        |
| `caf\XC3A9\`                          | `café`                    | `café`         | no, same value under UTF-8 |
| `a\X0D\b`                             | `a`, carriage return, `b` | `a\.br\b`      | **no**                     |
| `abcde\P\`                            | the text `abcde\P\`       | `abcde\E\P\E\` | **no**                     |
| `\XFF\` (not UTF-8)                   | the text `\XFF\`          | `\E\XFF\E\`    | **no**                     |
| `\Q\` (no such code)                  | the text `\Q\`            | `\E\Q\E\`      | **no**                     |
| `\E\H\E\`                             | the text `\H\`            | `\H\`          | **no**                     |
| `\E\.sp\E\`                           | the text `\.sp\`          | `\.sp\`        | **no**                     |

Every **no** has one of three causes, and each is an issue:

- **Data and markup share the string** (#1165). `\E\H\E\` and `\E\.sp\E\` come back as commands. This is `glionValue_collides`.
- **A sequence glion does not know becomes data** (#1166). The decoder keeps `\P\`, `\XFF\` and `\Q\` as text; the encoder recognises markup by a fixed list (`VERBATIM_SEQUENCE` in `@glion/utils`), and none of the three is on it, so each is escaped as data. The receiver of `abcde\E\P\E\` reads eight characters, not a value the sender truncated. In the model, `unescape` reads every code that is not a character as a sequence, whatever its letters.
- **`\.br\` and the carriage return trade places** (#1167). One piece of markup is read as a character, so a character that arrived as `\X0D\` goes back out as markup.

`caf\XC3A9\` is not a defect: glion and the model share the agreement that a message is UTF-8 (#659), so the value is `café` either way. Only the text changes, and a sender writes `café`.

The model also says what glion's tree needs: a sequence held apart from the characters around it, a parser that reads any code other than `F`, `S`, `T`, `R`, `E` as a sequence, and a serializer that writes a sequence back as its code. That is `unescape` and `escape`, and `unescape_escape` proves that the round trip is exact.

## 17. The harness, as refinement

Lesson 5's harness checks glion against the model through an **abstraction function** (Hoare, 1972, "Proof of correctness of data representations"): a map from the implementation's state to the model's, here from glion's tree to a `Message`. An implementation is correct when each of its operations, seen through the abstraction function, does what the model's operation does.

For values, the abstraction function reads glion's string by glion's own convention (`differential/src/abstraction.ts`): a sequence glion kept is a sequence, and a carriage return was `\.br\`. With that reading, both properties fail on #1165:

```text
{"delimiters":"!+&#%","header":[[[["#F#"]]]],"segments":[]}
```

`#` is the escape character. The model sends the data `#F#` as `#E#F#E#`; glion reads it back as the string `#F#`; the abstraction function reads that as the sequence `F`. No abstraction function could do better: by `glionValue_collides`, the information is gone from the tree. That is the formal sense in which the defect lies in the tree, not in the parser or the serializer alone.

The generator draws every kind of sequence the model defines, and data that only looks like one, and the properties are left to fail. The harness reports every difference between glion and the model; deciding which ones are defects is the owner's job, not the generator's. A generator narrowed until the properties pass would only record what the harness no longer looks at. Hexadecimal data is the one sequence it does not draw, and that is not a narrowing: in the model it is characters, so there is no `\X41\` value to draw.

# What you can now say

About escape sequences:

- §2.7's sequences stand for a character, for markup, or for something sender and receiver agree on. Only the first kind is encoding; the other two are content.
- A value is a list of pieces. Four rules make its encoding unambiguous and readable: no carriage return in data, only defined sequences, no delimiter in a sequence, and no delimiter a code letter.

About formalization:

- **Choose the representation first,** and judge it by expressiveness, no confusion and no junk. A rule can remove junk; nothing can remove confusion.
- **Give every side condition a source:** the standard's text, or a counterexample. A counterexample to the theorem is the strongest justification.
- **Prove injectivity through a left inverse,** and prove a reader's lemmas with a generalized accumulator and an arbitrary tail.
- **Let the proof find rules.** A goal that cannot be closed names a missing fact; a counterexample confirms it.
- **Compare an implementation through an abstraction function.** When no abstraction function can work, the implementation's state has lost information.

# Exercises

They go from predicting to proving to designing. Try each before opening its answer.

**1. Predict.** What does `escape Delimiters.suggested (data "~&\\")` write? And `escape sField (data "S")`?

<details><summary>Answer</summary>

`\R\\T\\E\`: each of the three characters is a delimiter. `S` is `sField`'s field separator, so it is written `\F\`. That message would break `well_formed_delimiters_not_escape_codes`, but `escape` writes text for any value, well formed or not, as `encode` does.

</details>

**2. Classify.** Which rules does this message break, and which sequence breaks which?

```lean
def odd : Message :=
  ⟨Delimiters.suggested, [], [⟨"OBX".toList,
    [[[[[.sequence "C2d41".toList]], [[.sequence ".in".toList]]], [[[.sequence "Za~b".toList]]]]]⟩]⟩
```

<details><summary>Answer</summary>

`["well_formed_escape_sequence_defined", "well_formed_escape_sequence_no_delimiter"]`. `C2d41` has a lowercase hexadecimal digit and `.in` has no number, so neither is defined; `Za~b` holds the repetition separator. `#eval odd.failures` confirms it.

</details>

**3. Break the encoding.** In a copy of `spec/`, make `escapeChar` write `'T'` for the component separator instead of `'S'`, and run `lake build`. Which lemmas fail, and why does `decode_encode` report no error itself?

<details><summary>Answer</summary>

`unescape_escapePiece_append` fails in the component case: `readCode` reads `T` as the subcomponent separator, so reading back `\T\` does not give `^`. `not_mem_escape` also fails in that branch, because its `simp` call names `'S'`. `decode_encode` only uses these lemmas, so the error appears where the fact is proved, not where it is used. A proof is checked lemma by lemma, and that tells you exactly which fact a change broke.

</details>

**4. Prove it in general.** `glionValue_collides` uses the suggested delimiters. Prove that glion's representation has confusion for every choice of delimiters:

```text
theorem glionValue_not_injective (d : Delimiters) : ∃ v w, v ≠ w ∧ glionValue d v = glionValue d w
```

<details><summary>Answer</summary>

Give the two values, then let `simp` check each half:

```lean
theorem glionValue_not_injective (d : Delimiters) :
    ∃ v w, v ≠ w ∧ glionValue d v = glionValue d w :=
  ⟨[.char d.escape, .char 'H', .char d.escape], [.sequence ['H']], by simp,
    by simp [glionValue, glionPiece]⟩
```

`decide` cannot do it, because `d` is a variable. An existential is proved by its witness: here, the escape character, `H` and the escape character again as data, against the sequence `H`.

</details>

**5. Find the junk.** Section 4 claims a list of pieces has junk without a rule. Without looking at section 9, find two different values that `escape Delimiters.suggested` writes as the same text, and say which rule excludes one of them.

<details><summary>Answer</summary>

Any delimiter as a character against its code as a sequence: `[.char '|']` and `[.sequence ['F']]` are both written `\F\`, as are `[.char '\\']` and `[.sequence ['E']]`. `well_formed_escape_sequence_defined` excludes the sequence, because `isDefinedSequence ['F']` is false.

</details>

**6. Design.** §2.7.1 allows `\H\`, `\N\`, `\X\` and `\Z\` only in fields of type TX, FT and CF, and §2.7.7 allows formatting commands only in FT. The message here has no data types. What would you add to the specification to state this rule, and what would `encode_injective` say afterwards?

<details><summary>Things to weigh</summary>

The data type of a field is not in the text: it comes from the segment definitions of the version in MSH-12. A rule needs that information as an input, for example a function from a segment ID and a field position to a data type, and `Message.WF` would take it as a parameter. `encode_injective` would not change: a new rule only excludes messages, and the theorem already holds for all of them. This is a rule about conformance, not about unambiguity, and keeping the two apart keeps the encoding theorem small.

</details>

**7. Open question.** `splitLocal` and `caret` are counterexamples to `decode_encode`, not to `encode_injective`. Are `well_formed_escape_sequence_no_delimiter` and `well_formed_delimiters_not_escape_codes` needed for `encode_injective`? Try to build two messages, well formed except for one of these rules, with the same text before you answer.

<details><summary>Things to weigh</summary>

`escape` writes every escape character in data as `\E\`, so an escape character on the wire always opens or closes a sequence. A decoder that reads sequences before it splits at separators could recover `splitLocal`, so `encode` may be injective without the rule. The rules make the proof's decoder correct, which splits first as a receiver does. Showing injectivity without them would need a different decoder and a different proof; showing they are needed would need a counterexample. Either is a result.

</details>

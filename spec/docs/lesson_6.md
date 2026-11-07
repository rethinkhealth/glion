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
| Test the assumptions      | Where do real senders and receivers go wrong?                 | 18       |

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
- **By agreement.** `\X…\` and `\Z…\` mean what sender and receiver agree on: "The interpretation of the data is entirely left to an agreement between the sending and receiving applications that is beyond the scope of this Standard" (§2.7.6, §2.7.8). `\C…\` and `\M…\` change how the characters after them are read.

### Is `\X41\` the letter `A`?

`\X…\` is hexadecimal data: `\X41\` is the byte `0x41`, which is `A` in ASCII. Should a reader turn it into `A`?

No. §2.7.6 defines the form, "1 or more pairs of hexadecimal digits" that "represent 8-bit binary values", but not what those bytes mean: "The interpretation of the data is entirely left to an agreement between the sending and receiving applications that is beyond the scope of this Standard." The same bytes mean different characters under different agreements: `\XE9\` is `é` in ISO 8859-1 and not a character at all in UTF-8.

So translating hexadecimal data is outside the specification. The specification keeps `\X41\` as written, the same way it keeps `\H\`. In glion, a user who has such an agreement reads `\X…\` with a plugin of their own. The parser reads only the control characters below.

### The exception: control characters

A **line feed** (LF, U+000A, written `\n` in most programming languages) is a control character: it tells a device to do something rather than print a symbol. The name comes from the teletype. A line feed moved the paper up one line, and a **carriage return** (CR, U+000D, `\r`) moved the print head back to the left edge, so a new line took both. Operating systems still disagree on which to keep: UNIX ends a line with LF, Windows with CR then LF, and the classic Mac OS with CR alone. HL7v2 ends every segment with a carriage return (§2.5.4) and gives the line feed no meaning of its own.

Take a line feed in data. If the sender wrote it as it is, many receivers, glion's parser among them, would end the segment there. A line feed has no safe way to appear in the text, so the specification writes it as `\X0A\` and reads `\X0A\` back as a line feed. The same goes for every control character from U+0000 to U+001F except the carriage return, which is the segment terminator and is never allowed in data (section 15).

| Text      | What the specification reads |
| --------- | ---------------------------- |
| `a\X0A\b` | `a`, a line feed, `b`        |
| `a\X41\b` | `a`, the sequence `X41`, `b` |

### What to remember

For each sequence, ask: does it disappear when the receiver reads the value?

| Text            | The value             | Disappears?                                     |
| --------------- | --------------------- | ----------------------------------------------- |
| `SMITH\T\JONES` | `SMITH&JONES`         | Yes: `\T\` was only how to write `&`            |
| `a\X0A\b`       | `a`, a line feed, `b` | Yes: `\X0A\` was only how to write a line feed  |
| `\H\240*\N\`    | `240*`, highlighted   | No: the highlighting is part of what was sent   |
| `\X41\`, `\Z…\` | kept as written       | No: only sender and receiver know what it means |

A sequence that disappears is **how a value is written**. A sequence that stays is **part of the value**. The rest of this lesson needs that split: a model of a value has to keep the sequences that stay, and must not keep the ones that disappear.

# Part II: Choosing a representation

## 3. What makes a representation right

Every formalization starts by deciding what its objects are. Here the object is a value, and `encode` maps values to text. Three properties judge a choice:

1. **Expressive.** Every value the standard can send has a representation. A model that cannot hold `\H\` cannot describe a lab report that uses it.
2. **No confusion.** Two different meanings never share a representation. If they do, no encoding can write both correctly.
3. **No junk.** Two representations never share a meaning, or a rule excludes all but one. Otherwise `encode` sends two representations to one text, and `encode_injective` is false.

The last two are a slogan of algebraic specification, "no junk, no confusion", from the work of Burstall and Goguen: a model should contain exactly the values the theory describes, each once.

## 4. Four candidates

| Representation of a value                  | Expressive                  | No confusion                  | No junk                      | Where                         |
| ------------------------------------------ | --------------------------- | ----------------------------- | ---------------------------- | ----------------------------- |
| Characters; delimiters forbidden in data   | No: no delimiter, no markup | Yes                           | Yes                          | This spec, lessons 1–4        |
| Characters; the five delimiter sequences   | No markup                   | Yes                           | Yes                          | This spec, before this lesson |
| One string, markup kept as its text        | Yes                         | **No**                        | Yes                          | glion's tree before #1169     |
| One string, every sequence kept, `\E\` too | Yes                         | Only with a rule (section 15) | No: a lone escape character  | glion's tree since #1169      |
| A list of pieces: characters and sequences | Yes                         | Yes                           | Only with a rule (section 9) | This spec now                 |

The third row is glion until #1169. Its tree held a value as one string: decoded characters, and every sequence it did not decode left as its text. The data `\H\` (sent `\E\H\E\`) and the command `\H\` became the same string. Section 15 proves it. The fourth row is glion since #1169 (ADR 0036): it keeps `\E\` as written too, so the two are two strings. A string with a lone escape character, such as `C:\temp`, is junk: no list of pieces is written that way. Section 15 shows the one confusion left, and the rule that removes it.

The last row is the choice this specification makes. A value is a list of pieces, each a character or a sequence. It is expressive, and it has no confusion by construction. It has junk: the piece `sequence F` and the character `|` both mean the field separator. Section 9 shows the rule that removes it.

# Part III: The model

## 5. Pieces

`Spec/Escape.lean` defines the piece:

```lean
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

```lean
def escapeChar (d : Delimiters) (c : Char) : List Char :=
  if c = d.field then [d.escape, 'F', d.escape]
  else if c = d.component then [d.escape, 'S', d.escape]
  else if c = d.subcomponent then [d.escape, 'T', d.escape]
  else if c = d.repetition then [d.escape, 'R', d.escape]
  else if c = d.escape then [d.escape, 'E', d.escape]
  else if isControl c then d.escape :: controlCode c ++ [d.escape]
  else [c]

def escapePiece (d : Delimiters) : Piece → List Char
  | .char c => escapeChar d c
  | .sequence code => d.escape :: code ++ [d.escape]

def escape (d : Delimiters) (value : List Piece) : List Char :=
  value.flatMap (escapePiece d)
```

A character that is a delimiter becomes its sequence, a control character becomes `\Xdd\` (`controlCode` gives `X0A` for a line feed), and any other character stays. A sequence is written as its code between two escape characters. Run them:

```lean
#eval escapeChar Delimiters.suggested '&'                                -- ['\\', 'T', '\\']
#eval String.ofList (escape Delimiters.suggested (data "SMITH&JONES"))  -- "SMITH\\T\\JONES"
#eval String.ofList (escape Delimiters.suggested highlighted)           -- "\\H\\240*\\N\\"
#eval String.ofList (escape Delimiters.suggested (data "\\H\\"))        -- "\\E\\H\\E\\"
#eval String.ofList (escape Delimiters.suggested (data "Line1\nLine2")) -- "Line1\\X0A\\Line2"
```

`#eval` prints a string with its backslashes doubled. The last two lines are the point of the representation: the command `\H\` and the data `\H\` are two values, written as two texts.

## 7. Which sequences exist

`isDefinedSequence` says which codes §2.7.2 to §2.7.8 define. Read it against the table of section 1, one line per row:

```lean
def isDefinedSequence : List Char → Bool
  | ['P'] | ['H'] | ['N'] => true
  | 'C' :: ds => ds.length == 4 && ds.all isHexDigit
  | 'M' :: ds => (ds.length == 4 || ds.length == 6) && ds.all isHexDigit
  | 'X' :: ds => isHexPairs ds && (controlChar? ('X' :: ds)).isNone
  | 'Z' :: _ => true
  | '.' :: command => isFormattingCommand command
  | _ => false
```

`isFormattingCommand` accepts the eight commands of §2.7.7: `.sp` and `.sk` with an optional count, `.in` and `.ti` with a signed number, and `.br`, `.fi`, `.nf` and `.ce` with none, each argument after an optional space.

```lean
#eval ["P", "H", "N", "C2D41", "M2442", "X41", "XC3A9", "X0D", "Zab", ".br", ".sp", ".sp 2", ".in+4", ".ti-4", ".ce"].map (isDefinedSequence ·.toList)
-- [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
#eval ["F", "X0A", "Q", "C2D4", "C2d41", ".sp x", ".in", ".xx", "", "Z|"].map (isDefinedSequence ·.toList)
-- [false, false, false, false, false, false, false, false, false, true]
```

`F` is false on purpose: the five delimiter codes are characters, not sequences. `X0A` is false for the same reason: it is the line feed, a character (section 2). `X41` and `X0D` are true: the first is hexadecimal data the model carries, and the second too, because the model gives a carriage return in data no form at all. `C2d41` is false because §2.7.6 lists the hexadecimal digits as "0, 1, . . . , 9, A, . . . , F", in uppercase. `Z|` is true here: whether a sequence may hold a delimiter is a separate rule (section 9).

A formalization must also say what it leaves out, and this one does (README, "Statements from Chapter 2", row `escape_sequences_by_data_type` and the line after the table): which data types may use which sequence, because a message here has no data types; and where in a line `\.in\` and `\.ti\` may stand.

## 8. Encoding a message

One line of `Spec/Encoding.lean` uses `escape`: `encodeField` joins the subcomponents of a component, each written through it.

```lean
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

**`well_formed_subcomponent_no_terminator`: no carriage return in data.** No sequence of §2.7 stands for one in the model: `\.br\` is markup, and `\X0D\` is hexadecimal data the model carries without reading. Without the rule, two messages share a text:

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

**`well_formed_delimiters_not_code_characters`: no delimiter is `F`, `S`, `T`, `R`, `E`, `X` or a hexadecimal digit.** The standard allows letters as delimiters, so this rule is the specification's decision, and the README records it. With `S` as the field separator, `\S\` splits where it stands; with `0` as one, `\X0A\` would:

```lean
def sField : Delimiters := { Delimiters.suggested with field := 'S' }
def caret : Message := ⟨sField, [], [⟨"PID".toList, [[[[data "^"]]]]⟩]⟩

#eval String.ofList (encode caret)   -- "MSHS^~\\&\x0dPIDS\\S\\\x0d"
#eval (decode (encode caret)).segments.map (·.fields)
-- [[[[[[Hl7v2.Spec.Piece.char '\\']]]], [[[[Hl7v2.Spec.Piece.char '\\']]]]]]
#eval caret.failures                 -- ["well_formed_delimiters_not_code_characters"]
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
+ "well_formed_delimiters_distinct", "well_formed_delimiters_not_code_characters", …,
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

```lean
theorem encode_injective (h₁ : m₁.WF) (h₂ : m₂.WF) (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]
```

If some `decode` undoes `encode` on well-formed messages, two messages with the same text are the same message. Proving a left inverse is easier than proving injectivity directly: it is a computation, and each level of the message is proved on its own. `decode` exists only to carry this proof; it is not part of the specification.

For values, the left inverse is `unescape`, and the lemma to prove is `unescape_escape`:

```lean
#check @unescape_escape
```

```lean
unescape_escape : ∀ (d : Delimiters), ¬d.escape ∈ codeCharacters →
  ∀ (v : List Piece), (∀ (p : Piece), p ∈ v → p.isDefined = true ∧ Piece.NoDelimiter d p) →
    unescape d (escape d v) = v
```

## 12. The reader

The previous reader took the two characters after an escape character without looking at them, which worked because every code had one letter. A code is now any length, so the reader must find the closing escape character. It is a small state machine, in `Thm/Encoding/Escape.lean`:

```lean
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

The state is `none` outside a sequence and `some code` inside one, holding the code read so far. At the closing escape character, `readCode` decides: a one-letter code among `F`, `S`, `T`, `R`, `E` is a character (`unescapeCode` gives the delimiter), `X` with two digits naming a control character is that character (`controlChar?`), and any other code is a sequence. An escape character with no closing one is data. Written this way, the reader is structurally recursive on the text, so Lean accepts it without a termination proof.

```lean
#eval unescape Delimiters.suggested "\\H\\240*\\N\\".toList == highlighted   -- true
#eval unescape Delimiters.suggested "a\\b".toList == data "a\\b"             -- true
```

## 13. The lemmas, in dependency order

| Lemma                              | Says                                                                            | Uses                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `readAux_code`                     | Inside a sequence, the reader reads the code up to the closing escape character | The code holds no escape character                                                                      |
| `isDefinedSequence_not_escapeCode` | A one-letter code among `F`, `S`, `T`, `R`, `E` is not a defined sequence       | `decide`, five cases                                                                                    |
| `controlChar?_controlCode`         | Reading the code a control character is written with gives the character        | `hexValue_hexDigit`, by `decide` over 16 digits                                                         |
| `readCode_of_defined`              | A defined sequence is read back as itself                                       | `isDefinedSequence` excludes the five letters and the control codes                                     |
| `unescape_escapePiece_append`      | Reading one written piece followed by any text gives the piece first            | The two above, and the escape character is not a code letter                                            |
| `unescape_escape`                  | `unescape d (escape d v) = v`                                                   | Induction on `v`, with the lemma above                                                                  |
| `not_mem_escape`                   | No separator appears in a written value                                         | Distinct delimiters, no delimiter a code letter, no carriage return in data, no delimiter in a sequence |

Two techniques carry the proof, and both recur in proofs about any parser.

**Generalize the accumulator.** `readAux_code` is stated for any code already read, `acc`, not just the empty one. The induction step reads one more character into `acc`, so a hypothesis fixed at `[]` would not apply. This is the `induction code generalizing acc` line.

**State it with a tail.** `unescape_escapePiece_append` says what the reader does with `escapePiece d p ++ t` for any `t`, not with `escapePiece d p` alone. The reader never sees a piece in isolation; it sees a piece followed by the rest of the value. With the tail in the statement, the induction in `unescape_escape` is one rewrite per piece.

`not_mem_escape` connects values to fields. `decode` splits a field at its separators before it reads any value, as a receiver does, and splitting undoes joining only when no separator occurs inside a part (`map_splitOn_intercalate`, lesson 4's appendix). So the proof needs no written value to contain a separator, and that lemma is where `escape_sequence_no_delimiter` and the separator half of `delimiters_not_code_characters` are used.

## 14. A rule the proof found

The first draft of the rules said only that no **separator** is a code letter, as the specification said before this lesson. The proof of `unescape_escapePiece_append` then stopped in the character case: to read `\F\` back, the reader must see `F` as the code and not as the closing escape character, which needs `'F' ≠ d.escape`. Nothing gave it. The counterexample is short:

```lean
def fEscape : Delimiters := { Delimiters.suggested with escape := 'F' }

#eval String.ofList (escape fEscape (data "|"))     -- "FFF"
#eval unescape fEscape (escape fEscape (data "|"))  -- [Hl7v2.Spec.Piece.sequence [], Hl7v2.Spec.Piece.char 'F']
```

`|` is written `FFF`. The reader opens a sequence at the first `F`, closes it at the second with an empty code, and reads the third as data. So the rule became "no **delimiter** is a code letter". It widened once more when control characters were written as `\X0A\`: the proof of `not_mem_escape` needed no separator among `X` and the hexadecimal digits, and the rule took its present name, `well_formed_delimiters_not_code_characters`. The old reader never needed it, because it did not look for the end of a sequence.

This is how side conditions are usually found: not by reading the standard more closely, but by a proof that cannot continue. The goal Lean cannot close names the missing fact, and a small counterexample confirms the fact is needed.

# Part VII: glion against the model

## 15. glion's representation, formally

Until #1169, glion's tree flattened a value into one string (ADR 0031): a character went in as itself, and a sequence went in as its text. Model that, and prove the confusion of section 4:

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

Two different values, one string. Whatever `@glion/to-hl7v2` wrote for the string `\H\`, it was wrong for one of them. This is lesson 1's `ambiguous_without_distinct_delimiters` one level down: there, two messages shared a text; here, two values share a tree.

Since #1169 (ADR 0036), glion's string keeps every sequence as written, `\E\` included, and decodes only the separators and the control characters, a carriage return among them. A data escape character is therefore the text `\E\`, and the sequence `\X0D\` is a carriage return:

```lean
def keptPiece (d : Delimiters) : Piece → List Char
  | .char c => if c = d.escape then [d.escape, 'E', d.escape] else [c]
  | .sequence code => if code = "X0D".toList then ['\r'] else d.escape :: code ++ [d.escape]

def keptValue (d : Delimiters) (v : List Piece) : List Char := v.flatMap (keptPiece d)

theorem keptValue_separates :
    keptValue Delimiters.suggested (data "\\H\\") ≠ keptValue Delimiters.suggested [.sequence ['H']] := by
  decide
```

The collision of `glionValue_collides` is gone: the data is `\E\H\E\`, the command `\H\`. One remains, with the carriage return:

```lean
def crData : List Piece := data "a\rb"
def crHex : List Piece := data "a" ++ [.sequence "X0D".toList] ++ data "b"

#eval keptValue Delimiters.suggested crData == keptValue Delimiters.suggested crHex     -- true
```

Two values, one string, but `crData` breaks `well_formed_subcomponent_no_terminator`. Among well-formed values the representation has no confusion: the model's rule removes the one value that would collide. That is the formal content of the open question of whether the model should adopt glion's reading, a carriage return in data written `\X0D\`: the rule would go, and `crHex` would become `crData`.

## 16. What glion does to each sequence

Each row was run through `@glion/parser` and `@glion/to-hl7v2` with `|^~\&`, since #1169:

| Received                         | glion's tree holds        | Written back | Same text |
| -------------------------------- | ------------------------- | ------------ | --------- |
| `a\F\b` (and `\S\` `\T\` `\R\`)  | the separator             | the same     | yes       |
| `a\E\b`                          | the text `a\E\b`          | the same     | yes       |
| `\H\240*\N\`                     | the text `\H\240*\N\`     | the same     | yes       |
| `\.sp 2\`, `\.br\`, `\.in+4\`, … | the text                  | the same     | yes       |
| `\Zab\`, `\C2D41\`, `\M2442\`    | the text                  | the same     | yes       |
| `caf\XC3A9\`, `\XFF\`, `\X7C\`   | the text                  | the same     | yes       |
| `Line1\X0A\Line2`                | a line feed between       | the same     | yes       |
| `a\X0D\b`                        | `a`, carriage return, `b` | the same     | yes       |
| `abcde\P\`, `\Q\` (no such code) | the text                  | the same     | yes       |
| `\E\H\E\`, `\E\.sp\E\`           | the text                  | the same     | yes       |

Before #1169, seven of these rows were **no**, each from one of four causes, and each an issue:

- **Data and markup shared the string** (#1165): `\E\H\E\` came back as the command `\H\`. This is `glionValue_collides`.
- **A sequence glion did not know became data** (#1166): `abcde\P\` was written back `abcde\E\P\E\`.
- **`\.br\` and the carriage return traded places** (#1167): `a\X0D\b` was written back `a\.br\b`.
- **Hexadecimal data was read by default** (#1168): `caf\XC3A9\` was written back `café`.

All four came from decoding a sequence into a string that could no longer tell it from another text. ADR 0036 removed the cause: glion decodes only what the structure of a message requires, and `keptValue_separates` is the representation that results.

The model also says what glion's tree needs: a sequence held apart from the characters around it, a parser that reads any code other than `F`, `S`, `T`, `R`, `E` and a control character's `\Xdd\` as a sequence, and a serializer that writes a sequence back as its code. That is `unescape` and `escape`, and `unescape_escape` proves that the round trip is exact.

## 17. The harness, as refinement

Lesson 5's harness checks glion against the model through an **abstraction function** (Hoare, 1972, "Proof of correctness of data representations"): a map from the implementation's state to the model's, here from glion's tree to a `Message`. An implementation is correct when each of its operations, seen through the abstraction function, does what the model's operation does.

For values, the abstraction function reads glion's string by glion's own convention (`differential/src/abstraction.ts`): `\E\` is the escape character, a carriage return is the sequence `\X0D\`, and every other sequence glion kept is a sequence. Before #1169 both properties failed on #1165:

```text
{"delimiters":"!+&#%","header":[[[["#F#"]]]],"segments":[]}
```

`#` is the escape character. The model sent the data `#F#` as `#E#F#E#`; glion read it back as the string `#F#`; the abstraction function read that as the sequence `F`. No abstraction function could do better: by `glionValue_collides`, the information was gone from the tree. That is the formal sense in which the defect lay in the tree, not in the parser or the serializer alone. Since #1169 both properties hold, and each records a mutant that makes it fail.

An abstraction function is part of the claim. Each time glion's convention changed, its reading of a value had to change too, and a reading that adapts to every change can hide a difference. The carriage return is the case in point: the abstraction function reads glion's carriage return as the model's `\X0D\`, so the properties pass while the two representations differ, as section 15 shows. Each line of the abstraction function cites the decision it follows, and changing one is a decision, not a fix.

The generator draws every kind of sequence the model defines, and data that only looks like one, and the properties are left to fail. The harness reports every difference between glion and the model; deciding which ones are defects is the owner's job, not the generator's. A generator narrowed until the properties pass would only record what the harness no longer looks at.

## 18. Sender and receiver: where things go wrong

The model says what a text means. A real exchange has two programs, each with its own way of reading. Each case below was run through the oracle and through glion since #1169:

| Case                                  | The sender writes                         | A receiver that reads it right                    | Where it goes wrong                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A line feed in data                   | `PID\|Line1\X0A\Line2` (the model's text) | reads hexadecimal data: a line feed               | A receiver without hexadecimal data shows `\X0A\`. A sender that writes the line feed raw is worse: glion's parser reads `PID\|Line1␊Line2␍` as two segments, `PID` and one whose ID is `Line2`                                  |
| A line break in a report              | `OBX\|1. Normal\.br\2. Stable`            | displays formatted text: two lines                | A consumer that extracts plain text shows `\.br\`, unless it reads formatted text (#1002). glion keeps `\.br\` in the value as written; a program that turns it into a carriage return and writes the value raw ends the segment |
| Latin-1 hexadecimal data              | `caf\XE9\`, with MSH-18 `8859/1`          | reads 0xE9 as Latin-1: `café`                     | 0xE9 alone is not UTF-8. A receiver that assumes UTF-8 cannot read it. glion keeps `\XE9\` and writes it back as it arrived, so the agreement is left to the next receiver                                                       |
| UTF-8 hexadecimal data                | `caf\XC3A9\`                              | reads UTF-8: `café`                               | A Latin-1 receiver reads two bytes, `cafÃ©`: decoding helps no one without the agreement. glion keeps `\XC3A9\` as written                                                                                                       |
| A delimiter as hexadecimal data       | `PID\|\X7C\`                              | splits first, then reads the byte: the value `\|` | A receiver that decodes before it splits breaks the field in two. glion decodes only the code it writes for `                                                                                                                    | `, `\F\`, so it keeps `\X7C\` and writes it back as it arrived |
| A carriage return as hexadecimal data | `PID\|a\X0D\b`                            | keeps the sequence, or shows a line break         | A receiver that decodes it and writes the value back raw ends the segment at it. glion reads a carriage return and writes back `\X0D\`; the model keeps the sequence (section 15)                                                |
| A carriage return in data             | `PID\|a␍b`                                | none: every receiver reads two segments           | The oracle names the rule it breaks, `well_formed_subcomponent_no_terminator`, and still writes the text, as `encode` writes text for any message                                                                                |

Three patterns account for every row.

- **An agreement assumed but not shared.** Hexadecimal data means what MSH-18 and the two parties say. The model is safe here only because it does not read what it has not agreed on.
- **Reading in the wrong order.** A receiver must split at separators before it decodes any sequence. `decode_encode` is a theorem about exactly that order, which is why `well_formed_escape_sequence_no_delimiter` and `well_formed_delimiters_not_code_characters` exist.
- **Writing a decoded value back without escaping it.** Every raw carriage return and line feed above comes from a program that decoded a value and then wrote it out as it was. `escape` writes every character in a safe form, which is what `unescape_escape` relies on.

# What you can now say

About escape sequences:

- A sequence either disappears when the value is read (a delimiter, a control character) or is part of the value (highlighting, formatting, `\X…\`, `\Z…\`).
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

`\R\\T\\E\`: each of the three characters is a delimiter. `S` is `sField`'s field separator, so it is written `\F\`. That message would break `well_formed_delimiters_not_code_characters`, but `escape` writes text for any value, well formed or not, as `encode` does.

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

```lean
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

**7. Open question.** `splitLocal` and `caret` are counterexamples to `decode_encode`, not to `encode_injective`. Are `well_formed_escape_sequence_no_delimiter` and `well_formed_delimiters_not_code_characters` needed for `encode_injective`? Try to build two messages, well formed except for one of these rules, with the same text before you answer.

<details><summary>Things to weigh</summary>

`escape` writes every escape character in data as `\E\`, so an escape character on the wire always opens or closes a sequence. A decoder that reads sequences before it splits at separators could recover `splitLocal`, so `encode` may be injective without the rule. The rules make the proof's decoder correct, which splits first as a receiver does. Showing injectivity without them would need a different decoder and a different proof; showing they are needed would need a counterexample. Either is a result.

</details>

**8. Which part of the model?** For each row of section 18's table, say which definition, rule or theorem of the model rules the problem out, or why none does.

<details><summary>Answer</summary>

- A raw line feed: `escapeChar` writes every control character as `\Xdd\`, so `encode` never writes one.
- `\.br\` as plain text: nothing, on purpose. Markup is content, and a display decision is outside the model.
- Latin-1 and UTF-8 hexadecimal data: nothing, on purpose. The model carries `\X…\` as written and makes no agreement.
- A delimiter as hexadecimal data: `decode_encode`, which proves the split-first reading recovers the message; a decode-first receiver is outside it.
- A carriage return as hexadecimal data: the model carries it as a sequence and never turns it into a character.
- A carriage return in data: `well_formed_subcomponent_no_terminator`, with `oneSegment` as its counterexample.

</details>

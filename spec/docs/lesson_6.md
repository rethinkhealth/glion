# Lesson 6: Changing the statement: escape sequences

Lesson 5 ended with a finding: glion decodes the escape sequences of HL7v2 §2.7, and the specification had none. glion followed the standard, so the statement was the side to change. This lesson reads that change: what was added, which rule was replaced, how the proof of `decode_encode` absorbed it, and how the harness then found the next disagreement.

It is also the first time the statement itself changes. A proof can change freely; a statement is what people own and review. Step 5 shows what that review looks like.

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

The rest of §2.7 defines more sequences: highlighting (`\H\`, `\N\`), formatted text (`\.br\`), hexadecimal data (`\Xdd\`), locally defined sequences (`\Z…\`) and character sets. The specification models only the five above. The README lists the rest under "Not yet covered".

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

## What you can now say

- **The model:** a delimiter in data is written as one of the five sequences of §2.7.1, and the escape character as `\E\`, so no value holds markup.
- **The rules:** a value may hold any delimiter but `\r`, and no separator may be an escape code letter.
- **The review:** the theorems' statements did not change, but what `encode` and `Message.WF` mean did, and that is what a person reviews.
- **The proof:** one device (`unescape`) and three lemmas; the shape of `decode_encode` stayed the same.

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

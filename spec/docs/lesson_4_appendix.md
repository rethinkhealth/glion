# Lesson 4, appendix: designing the proof of `decode_encode`

Lesson 4 uses `decode_encode` without opening it. This appendix opens it, and it is about **how such a proof is designed**: how you would arrive at `Hl7v2/Thm/Encoding/Decode.lean` yourself if the file did not exist. Reading a finished proof line by line teaches little; seeing the decisions behind it teaches a method you can reuse.

The method, which the sections below build one step at a time:

1. Picture the data, and write the proof on paper first.
2. Find the one fact that does the work.
3. Treat that fact's hypotheses as your to-do list.
4. When a hypothesis cannot be proved, look for a counterexample. If you find one, the specification needs a rule.
5. When the same proof shape appears twice, make it a lemma.
6. When the code is not in the shape your lemma expects, prove a lemma that reshapes it.
7. Build the pieces bottom-up, and assemble them top-down with `refine … ?_`.

Create `Hl7v2/Appendix4.lean`, start it with these lines, and paste each example below them:

```lean
import Hl7v2
open Hl7v2.Spec Hl7v2.Thm
```

Every example in this appendix builds without errors, except one, in A3, which shows an error on purpose.

## A1. Picture the data, and the paper proof

Recall the shape of a field (`Spec/Message.lean`): a subcomponent is a list of characters, a component is a list of subcomponents, a repetition is a list of components, and a field is a list of repetitions.

`encodeField` (`Spec/Encoding.lean`) writes a field by **joining** at each level, inside out:

```text
subcomponents joined with &    →  a component's text
components joined with ^       →  a repetition's text
repetitions joined with ~      →  the field's text
```

Then `|` goes in front of each field, the segment ID in front of the fields, and `\r` after each segment.

`decode` does the opposite: it **splits** at each level, outside in. So the paper proof is short:

> Splitting on a separator undoes joining with it. Apply that at each level, from `\r` down to `&`.

Everything in `Decode.lean` is this sentence, made precise. When you design a proof, start here: if you cannot say the proof in two sentences on paper, Lean will not find it for you.

## A2. Find the one fact that does the work

"Splitting undoes joining" must be a lemma about lists. Lean calls joining with a separator `intercalate`, and splitting `splitOn`. Search for a lemma that mentions both: in Loogle (loogle.lean-lang.org) type `List.splitOn, List.intercalate`. It finds:

```lean
#check @List.splitOn_intercalate
-- List.splitOn_intercalate (x : α) :
--   (∀ l ∈ ls, x ∉ l) → ls ≠ [] → List.splitOn x ([x].intercalate ls) = ls
```

Read it in English: "if no piece contains `x`, and there is at least one piece, then splitting the join on `x` gives back the pieces."

See it work, in the infoview:

```lean
#eval String.ofList (['^'].intercalate ["Smith".toList, "John".toList])   -- "Smith^John"
#eval ("Smith^John".toList.splitOn '^').map String.ofList               -- ["Smith", "John"]
```

The whole proof of `decode_encode` is this one lemma, used at five levels. The rest is making its two hypotheses true.

## A3. The hypotheses are the to-do list

Each hypothesis is there because without it the lemma is false. Find the counterexamples, so you know what each one protects against.

**Hypothesis 1: no piece contains `x`.**

```lean
#eval ((['^'].intercalate ["Sm^ith".toList, "John".toList]).splitOn '^').map String.ofList
-- ["Sm", "ith", "John"]: three pieces came back, two went in
```

**Hypothesis 2: at least one piece.**

```lean
#eval (['^'].intercalate ([] : List (List Char))).splitOn '^'
-- [[]]: zero pieces went in, one empty piece came back
```

Joining nothing gives the empty text, and splitting the empty text gives one empty piece. So an empty list of pieces cannot survive the trip.

Note what is **not** a problem: empty pieces themselves.

```lean
#eval (("a^^b".toList.splitOn '^')).map String.ofList   -- ["a", "", "b"]
```

`["a", "", "b"]` joins to `a^^b` and splits back to `["a", "", "b"]`. That is why HL7v2 empty components are fine, but a component with no subcomponents at all is not.

Now use the lemma on one level, the subcomponents of a component:

```lean
theorem split_join_amp (c : List (List Char)) (hc : c ≠ [])
    (hclean : ∀ s ∈ c, '&' ∉ s) : (['&'].intercalate c).splitOn '&' = c :=
  List.splitOn_intercalate '&' hclean hc
```

The proof is one term: give the lemma its separator and its two hypotheses.

**What happens when a hypothesis is missing.** This example shows an error, on purpose. Delete `hc` and leave a hole `?_` where it went:

```lean
example (c : List (List Char)) (hclean : ∀ s ∈ c, '&' ∉ s) :
    (['&'].intercalate c).splitOn '&' = c := by
  refine List.splitOn_intercalate '&' hclean ?_
```

Lean answers `unsolved goals … ⊢ c ≠ []`. The goal that is left is exactly the missing fact. This is the most useful habit in proof design: **write the step you believe in, leave a `?_` for what you cannot prove yet, and read the goal Lean hands back.**

## A4. Step 4 of the method: a counterexample means a rule

Suppose you are designing the specification and you reach that leftover goal `⊢ c ≠ []` for a component of a message. You cannot prove it, because nothing says a component has a subcomponent. Ask: is there a message where it is false and the claim breaks? Yes: a component with no subcomponents encodes to the empty text, which decodes as one empty subcomponent. Two different messages, one text.

So the claim is false without a rule, and the specification gets one: `component_has_subcomponent`. Every rule of `Message.WF` was found this way. Each one is a hypothesis of `List.splitOn_intercalate`, or of a later step, that could not be proved from the message alone:

| Leftover goal                                                | Counterexample                                                  | Rule                       |
| ------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------- |
| A value contains no separator                                | `Sm^ith` splits into two                                        | `subcomponent_clean`       |
| `^` is not inside a subcomponent's text, given it is not `&` | Component separator `&`, the same as the subcomponent separator | `delimiters_distinct`      |
| A field, repetition or component is not empty                | Zero pieces decode as one                                       | the three `…_has_…` rules  |
| A segment ID has no `\r`                                     | `P\rD` splits a segment in two                                  | `segment_id_no_terminator` |
| `take 3` of the segment's text is its ID                     | ID `PI`: `take 3` of `PI\|a` is `PI\|`                          | `segment_id_length`        |

That is the design loop: claim, proof attempt, stuck goal, counterexample, rule. The rules were not invented up front; the proof asked for them.

## A5. Step 5: when a shape repeats, make it a lemma

Go one level up, to a repetition: its components are joined with `^`, and each component is itself subcomponents joined with `&`. Splitting on `^` needs hypothesis 1 again: "no component's text contains `^`". But a component's text is a join with `&`. So you need:

> If no piece contains `^`, and `^` is not `&`, then `^` is not in the join of the pieces with `&`.

The same question appears at every level (is `~` inside an encoded repetition? is `|` inside an encoded field? is `\r` inside an encoded segment?). Prove it once, for any two characters. That is `not_mem_intercalate` in `Thm/Data/List.lean`:

```lean
#check @not_mem_intercalate
-- not_mem_intercalate : x ≠ y → (∀ l ∈ ls, x ∉ l) → x ∉ [y].intercalate ls

example (r : List (List Char)) (h : ∀ c ∈ r, '^' ∉ c) : '^' ∉ ['&'].intercalate r :=
  not_mem_intercalate (by decide) h
```

`by decide` proves `'^' ≠ '&'`, because both are known characters. In the real file the separators are variables, so that fact comes from `delimiters_distinct` instead: `h.cs` means "component ≠ subcomponent".

The second repeating shape is "split, then decode each piece". At every level but the innermost, decoding is `(text.splitOn x).map decodeOneLevelDown`. `map_splitOn_intercalate` packs `List.splitOn_intercalate` together with "decoding each piece undoes encoding it":

```lean
#check @map_splitOn_intercalate
-- map_splitOn_intercalate x p u t :
--   t ≠ [] → (∀ a ∈ t, x ∉ u a) → (∀ a ∈ t, p (u a) = a) →
--   (([x].intercalate (t.map u)).splitOn x).map p = t
```

Read `u` as "encode one level down" and `p` as "decode one level down". The lemma says: if decoding undoes encoding for each piece, and the pieces are safe to join, then decoding undoes encoding for the whole. That is the step that lets a proof go down one level at a time. Its three hypotheses are three goals you will see again and again in `Decode.lean`:

1. `t ≠ []`: there is a piece (a `…_has_…` rule);
2. `∀ a ∈ t, x ∉ u a`: the separator is not inside an encoded piece (`not_mem_intercalate`);
3. `∀ a ∈ t, p (u a) = a`: decoding undoes encoding one level down (the same proof, one level down).

## A6. Step 7: assemble top-down with `refine … ?_`

Now read `decodeField_encodeField` (`Decode.lean` lines 34–52). It is three levels of A5's lemma, assembled from the outside in. `refine` applies a lemma and turns each `?_` into a new goal; the `·` bullets then prove those goals in order.

| Lines | Goal                                                   | How                                                                                                                               |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 40    | `decodeField (encodeField f) = f`, split on `~`        | `map_splitOn_intercalate` with hypothesis 1 from `hf.1` (field has a repetition), leaving two `?_`                                |
| 41–46 | `~` is not inside an encoded repetition                | `not_mem_intercalate` twice (through `^`, then through `&`), with `h.cr` and `h.rs`; at the bottom, `hc'` is `subcomponent_clean` |
| 47–48 | decoding a repetition undoes encoding it, split on `^` | `map_splitOn_intercalate` again, with `hr0` (repetition has a component), leaving two `?_`                                        |
| 49–50 | `^` is not inside an encoded component                 | `not_mem_intercalate` with `h.cs`, then `subcomponent_clean`                                                                      |
| 51–52 | decoding a component undoes encoding it, split on `&`  | `List.splitOn_intercalate` directly: the bottom level, as in A3                                                                   |

Two idioms appear on almost every line.

**`obtain ⟨c, hc, rfl⟩ := List.mem_map.1 hl`.** You know `hl : l ∈ r.map encode`, and you want to know what `l` is. `List.mem_map` says that means "there is a `c ∈ r` with `encode c = l`". `obtain` unpacks it into `c`, `hc : c ∈ r`, and `rfl`, which replaces `l` by `encode c` everywhere. In English: "a piece of the encoded list is the encoding of some piece".

**`obtain ⟨_, hr'⟩ := hf.2 r hr`.** `FieldWF` (in `Thm/WellFormed.lean`) is a nest of `∧` and `∀`. `hf.2 r hr` reads "the rules, applied to repetition `r`", and gives a pair: `r ≠ []` and the rules for its components. `_` throws away the half you do not need here.

## A7. Step 6: reshape the code to fit the lemma

At the field level, the code is not a join. `encodeFields` writes `|` in front of each field:

```lean
#eval String.ofList (["a".toList, "b".toList].flatMap (fun s => '|' :: s))        -- "|a|b"
#eval String.ofList ('|' :: ['|'].intercalate ["a".toList, "b".toList])            -- "|a|b"
```

Same text, two shapes. `map_splitOn_intercalate` only knows the second one. So the file proves the two are equal, `flatMap_cons_eq_intercalate` in `Thm/Data/List.lean`, and rewrites with it (line 66). After that, `decodeFields` drops the first `|` (`| _ :: rest =>`, line 57) and the field level is A5 again.

The segment level has the same problem at the end: `encode` writes `\r` **after** each segment, so the text ends in `\r`, and splitting gives an extra empty piece:

```lean
#eval ("PID|a\r".toList.splitOn '\r').map String.ofList   -- ["PID|a", ""]
```

`decode` drops the last character first (`text.dropLast`, line 86), and `dropLast_flatMap_append` proves that "each line followed by `\r`, minus the last character" is a join with `\r` (line 113).

This is a common pattern when designing proofs: the code is written the natural way for the sender, the lemma is stated the natural way for lists, and a small reshaping lemma connects the two. When the goal does not match any lemma, ask "which equal expression would?" and prove that equality.

## A8. The segment ID: `take` and `drop`

A segment's text is its ID followed by its fields. `decode` reads `line.take 3` as the ID and `line.drop 3` as the fields. That works only when the ID has three characters:

```lean
#eval String.ofList (("PI".toList ++ "|a".toList).take 3)   -- "PI|"

example (id rest : List Char) (h : id.length = 3) : (id ++ rest).take 3 = id := by
  rw [List.take_append_of_le_length (by simp [h]), List.take_of_length_le (by simp [h])]

example (id rest : List Char) (h : id.length = 3) : (id ++ rest).drop 3 = rest := by
  rw [List.drop_append_of_le_length (by simp [h]), List.drop_of_length_le (by simp [h]),
    List.nil_append]
```

These are lines 124–127 of `Decode.lean`, with `hw.id_length` in place of `h`. Each `(by simp [h])` proves a small side condition such as `3 ≤ id.length`, using the length rule. This is where `segment_id_length` is used, and the only place.

## A9. The top: `decode_encode`, read as a plan

With A1 to A8 in hand, `decode_encode` (lines 92–128) reads as a plan in four parts.

| Lines   | Part                           | What it does                                                                                                                                                                                                              |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 93–97   | Gather facts                   | `hm.delimiters_distinct`, `hm.header`, `hm.segment` from `Thm/WellFormed.lean`, then open up `m` into `d`, `header`, `segments`                                                                                           |
| 98–108  | Hypothesis 1 at the `\r` level | `lines_ok`: no line contains `\r`. For the MSH line, `M`, `S`, `H` by `decide`, the delimiters by `h.tf`, `h.tc`, …, the fields by `not_mem_encodeFields`. For other lines, `id_no_terminator` and `not_mem_encodeFields` |
| 109–110 | The delimiters come back       | `delims`: `delimitersOf` reads `d` from positions 4 to 8; `simp` computes it                                                                                                                                              |
| 111–128 | The chain                      | Unfold `decode`, drop the last `\r` (A7), split on `\r` (A2 with `lines_ok`), then prove header and segments separately                                                                                                   |

Line 115, `Message.mk.injEq`, says two messages are equal when their delimiters, header and segments are equal. The delimiters part is already `d = d`, which `true_and` removes, so `constructor` leaves two goals: header (lines 117–118, `decodeFields_encodeFields` after dropping `MSH|^~\&`), and segments (lines 119–128, one segment at a time, A8 then `decodeFields_encodeFields`).

Lines 119–121 deserve one note. The goal is "mapping decode-after-encode over `segments` gives `segments`". `conv => rhs; rw [← List.map_id segments]` rewrites the right side as "mapping the identity over `segments`", so both sides are maps, and `List.map_congr_left` reduces the goal to one segment at a time. It is the same move `map_splitOn_intercalate` makes inside its own proof.

**Why the file reads bottom-up.** Lean needs a lemma before it is used, so the file starts with the smallest facts and ends with `decode_encode`. The design went the other way: the top was written first, with `?_` holes, and each hole became a lemma higher up the file. Read the file from the bottom when you want the plan, and from the top when you want the details.

## A10. Capstone exercise: design one yourself

Here is a smaller format with two levels: a field is repetitions joined with `~`, and a repetition is components (plain text here) joined with `^`.

```lean
def encodeRep (r : List (List Char)) : List Char := ['^'].intercalate r
def decodeRep (s : List Char) : List (List Char) := s.splitOn '^'
def encodeF (f : List (List (List Char))) : List Char := ['~'].intercalate (f.map encodeRep)
def decodeF (s : List Char) : List (List (List Char)) := (s.splitOn '~').map decodeRep

#eval String.ofList (encodeF [["a".toList, "b".toList], ["c".toList]])           -- "a^b~c"
#eval decodeF "a^b~c".toList == [["a".toList, "b".toList], ["c".toList]]          -- true
```

Design the theorem `decodeF (encodeF f) = f` using the method:

1. Write the statement with no hypotheses and the proof `by unfold decodeF encodeF; refine map_splitOn_intercalate '~' decodeRep encodeRep f ?_ ?_ ?_`.
2. Read the three goals. For each, decide: can it be proved, or is there a counterexample? Each counterexample becomes a hypothesis of your theorem, your own "well-formedness rules".
3. Prove the goals that remain, with `not_mem_intercalate` and `List.splitOn_intercalate`.
4. Check `#print axioms` shows only `propext` and `Quot.sound`.

<details><summary>Hint: which rules you need</summary>

Three: the field has a repetition (`f ≠ []`), each repetition has a component, and no component contains `^` or `~`. You do not need "`^ ≠ ~`" as a hypothesis, because both are known characters and `decide` proves it.

</details>

<details><summary>Answer</summary>

```lean
theorem decodeF_encodeF (f : List (List (List Char))) (hf : f ≠ [])
    (hr : ∀ r ∈ f, r ≠ [])
    (hclean : ∀ r ∈ f, ∀ c ∈ r, '^' ∉ c ∧ '~' ∉ c) : decodeF (encodeF f) = f := by
  unfold decodeF encodeF
  refine map_splitOn_intercalate '~' decodeRep encodeRep f hf (fun r hrf => ?_) (fun r hrf => ?_)
  · exact not_mem_intercalate (by decide) fun c hc => (hclean r hrf c hc).2
  · exact List.splitOn_intercalate '^' (fun c hc => (hclean r hrf c hc).1) (hr r hrf)

#print axioms decodeF_encodeF   -- [propext, Quot.sound]
```

Compare it with `decodeField_encodeField`: it is lines 40, 49–50 and 51–52 with one level fewer, and with fixed characters in place of `d.repetition` and `d.component`.

</details>

## What you can now say

- **The proof is one fact, used five times:** splitting on a separator undoes joining with it, when no piece contains the separator and there is at least one piece.
- **The rules come from the proof:** each `Message.WF` rule is a hypothesis that could not be proved, and each has a counterexample that shows two messages sharing a text.
- **The lemmas come from repetition and reshaping:** `not_mem_intercalate` and `map_splitOn_intercalate` because the same shape appeared at every level; `flatMap_cons_eq_intercalate` and `dropLast_flatMap_append` because the sender's code was not in the lemma's shape.
- **The habit:** write the step you believe in, leave `?_` for the rest, and read the goal Lean hands back.

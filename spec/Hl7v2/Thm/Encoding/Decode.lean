import Hl7v2.Spec
import Hl7v2.Thm.Data.List
import Hl7v2.Thm.Encoding.Delimiters
import Hl7v2.Thm.WellFormed

/-!
# Reading a message back from its text

`decode` and the readers below exist only to carry the proof of
`encode_injective`: they are not part of the specification. Each level has a
reader, a lemma that the reader undoes the writer, and a lemma that the text of
the level holds no separator of the levels above.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

variable {d : Delimiters}

/-! ## Component -/

/-- Proof device: read a component back from its text. -/
def decodeComponent (d : Delimiters) (text : List Char) : Component :=
  text.splitOn d.subcomponent

theorem decodeComponent_encodeComponent {c : Component} (hc : ComponentWF d c) :
    decodeComponent d (encodeComponent d c) = c :=
  List.splitOn_intercalate _ (fun s hs => hc.2 s hs _ (by simp [Delimiters.separators])) hc.1

theorem not_mem_encodeComponent {x : Char} (hx : x ∈ d.separators) (hs : x ≠ d.subcomponent)
    {c : Component} (hc : ComponentWF d c) : x ∉ encodeComponent d c :=
  not_mem_intercalate hs fun s hs' => hc.2 s hs' x hx

/-! ## Repetition -/

/-- Proof device: read a repetition back from its text. -/
def decodeRepetition (d : Delimiters) (text : List Char) : Repetition :=
  (text.splitOn d.component).map (decodeComponent d)

theorem decodeRepetition_encodeRepetition (hd : PairwiseDistinct d) {r : Repetition}
    (hr : RepetitionWF d r) : decodeRepetition d (encodeRepetition d r) = r :=
  map_splitOn_intercalate _ _ _ r hr.1
    (fun c hc => not_mem_encodeComponent (by simp [Delimiters.separators]) hd.cs (hr.2 c hc))
    (fun c hc => decodeComponent_encodeComponent (hr.2 c hc))

theorem not_mem_encodeRepetition {x : Char} (hx : x ∈ d.separators) (hc : x ≠ d.component)
    (hs : x ≠ d.subcomponent) {r : Repetition} (hr : RepetitionWF d r) :
    x ∉ encodeRepetition d r := by
  refine not_mem_intercalate hc fun l hl => ?_
  obtain ⟨c, hcr, rfl⟩ := List.mem_map.1 hl
  exact not_mem_encodeComponent hx hs (hr.2 c hcr)

/-! ## Field -/

/-- Proof device: read a field back from its text. -/
def decodeField (d : Delimiters) (text : List Char) : Field :=
  (text.splitOn d.repetition).map (decodeRepetition d)

theorem decodeField_encodeField (hd : PairwiseDistinct d) {f : Field} (hf : FieldWF d f) :
    decodeField d (encodeField d f) = f :=
  map_splitOn_intercalate _ _ _ f hf.1
    (fun r hr => not_mem_encodeRepetition (by simp [Delimiters.separators]) (Ne.symm hd.cr) hd.rs
      (hf.2 r hr))
    (fun r hr => decodeRepetition_encodeRepetition hd (hf.2 r hr))

theorem not_mem_encodeField {x : Char} (hx : x ∈ d.separators) (hr : x ≠ d.repetition)
    (hc : x ≠ d.component) (hs : x ≠ d.subcomponent) {f : Field} (hf : FieldWF d f) :
    x ∉ encodeField d f := by
  refine not_mem_intercalate hr fun l hl => ?_
  obtain ⟨r, hrf, rfl⟩ := List.mem_map.1 hl
  exact not_mem_encodeRepetition hx hc hs (hf.2 r hrf)

/-! ## The fields of a segment -/

/-- Proof device: read the fields of a segment back from the text after its ID. -/
def decodeFields (d : Delimiters) : List Char → List Field
  | [] => []
  | _ :: rest => (rest.splitOn d.field).map (decodeField d)

theorem decodeFields_encodeFields (hd : PairwiseDistinct d) {fields : List Field}
    (hf : ∀ f ∈ fields, FieldWF d f) : decodeFields d (encodeFields d fields) = fields := by
  cases fields with
  | nil => rfl
  | cons f t =>
    unfold encodeFields
    rw [flatMap_cons_eq_intercalate _ _ _ (by simp)]
    exact map_splitOn_intercalate _ _ _ _ (by simp)
      (fun g hg => not_mem_encodeField (by simp [Delimiters.separators]) hd.fr hd.fc hd.fs
        (hf g hg))
      (fun g hg => decodeField_encodeField hd (hf g hg))

theorem not_mem_encodeFields (hd : PairwiseDistinct d) {fields : List Field}
    (hf : ∀ f ∈ fields, FieldWF d f) : segmentTerminator ∉ encodeFields d fields := by
  simp only [encodeFields, List.mem_flatMap, List.mem_cons, not_exists, not_and, not_or]
  exact fun f hfm => ⟨hd.tf, not_mem_encodeField (by simp [Delimiters.separators]) hd.tr hd.tc
    hd.ts (hf f hfm)⟩

/-! ## Message -/

/-- Proof device: the delimiters in character positions 4 to 8 of the text. -/
def delimitersOf : List Char → Delimiters
  | _ :: _ :: _ :: f :: c :: r :: e :: s :: _ => ⟨f, c, r, e, s⟩
  | _ => Delimiters.suggested

/-- Proof device: read a message back from its text. -/
def decode (text : List Char) : Message :=
  let d := delimitersOf text
  match text.dropLast.splitOn segmentTerminator with
  | [] => ⟨d, [], []⟩
  | header :: segments =>
    ⟨d, decodeFields d (header.drop 8),
      segments.map fun line => ⟨line.take 3, decodeFields d (line.drop 3)⟩⟩

theorem decode_encode {m : Message} (hm : m.WF) : decode (encode m) = m := by
  have hd := pairwiseDistinct_of_nodup hm.separators_distinct
  have he := hm.escape_not_terminator
  have hh := hm.header
  have hs := hm.segment
  have hl := hm.segment_id_length
  have ht := hm.segment_id_no_terminator
  obtain ⟨d, header, segments⟩ := m
  have lines_ok : ∀ l ∈ encodeHeader d header :: segments.map (encodeSegment d),
      segmentTerminator ∉ l := by
    intro l hl
    simp only [List.mem_cons, List.mem_map] at hl
    rcases hl with rfl | ⟨s, hsm, rfl⟩
    · simp only [encodeHeader, mshId, Delimiters.encodingCharacters, List.cons_append,
        List.nil_append, List.mem_cons, not_or]
      refine ⟨by decide, by decide, by decide, hd.tf, hd.tc, hd.tr, Ne.symm he, hd.ts, ?_⟩
      simpa using not_mem_encodeFields hd hh
    · simp only [encodeSegment, List.mem_append, not_or]
      exact ⟨ht s hsm, not_mem_encodeFields hd (hs s hsm)⟩
  have delims : delimitersOf (encode ⟨d, header, segments⟩) = d := by
    simp [encode, encodeHeader, mshId, Delimiters.encodingCharacters, delimitersOf]
  unfold decode
  simp only [delims]
  rw [encode, dropLast_flatMap_append _ _ (by simp),
    List.splitOn_intercalate _ lines_ok (by simp)]
  simp only [Message.mk.injEq, true_and]
  constructor
  · simp only [encodeHeader, mshId, Delimiters.encodingCharacters]
    exact decodeFields_encodeFields hd hh
  · rw [List.map_map]
    conv => rhs; rw [← List.map_id segments]
    refine List.map_congr_left fun s hsm => ?_
    simp only [Function.comp_apply, encodeSegment, id]
    rw [List.take_append_of_le_length (by simp [hl s hsm]),
      List.take_of_length_le (by simp [hl s hsm]),
      List.drop_append_of_le_length (by simp [hl s hsm]),
      List.drop_of_length_le (by simp [hl s hsm]), List.nil_append,
      decodeFields_encodeFields hd (hs s hsm)]

end Hl7v2.Thm

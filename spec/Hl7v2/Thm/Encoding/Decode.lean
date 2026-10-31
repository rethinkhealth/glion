import Hl7v2.Spec
import Hl7v2.Thm.Data.List
import Hl7v2.Thm.Encoding.Delimiters
import Hl7v2.Thm.Encoding.Escape
import Hl7v2.Thm.WellFormed

/-!
# Reading a message back from its encoding

`decode` exists only to carry the proof of `encode_injective`: it is not part of
the specification.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- A separator other than the three inside a field never appears in its encoding. -/
theorem not_mem_encodeField {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.all) {x : Char} (hsep : x ∈ d.separators)
    (hr : x ≠ d.repetition) (hc : x ≠ d.component) (hs : x ≠ d.subcomponent)
    {f : Field} (hf : FieldWF d f) : x ∉ encodeField d f := by
  unfold encodeField
  refine not_mem_intercalate hr fun l hl => ?_
  obtain ⟨r, hrf, rfl⟩ := List.mem_map.1 hl
  obtain ⟨_, hr'⟩ := hf.2 r hrf
  refine not_mem_intercalate hc fun l hl => ?_
  obtain ⟨c, hcr, rfl⟩ := List.mem_map.1 hl
  obtain ⟨_, hc'⟩ := hr' c hcr
  refine not_mem_intercalate hs fun l hl => ?_
  obtain ⟨v, hv, rfl⟩ := List.mem_map.1 hl
  exact not_mem_escape hd hk hsep (hc' v hv)

/-- Proof device: read a field back from its encoding. -/
def decodeField (d : Delimiters) (s : List Char) : Field :=
  (s.splitOn d.repetition).map fun r => (r.splitOn d.component).map fun c =>
    (c.splitOn d.subcomponent).map (unescape d)

theorem decodeField_encodeField {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.all) {f : Field}
    (hf : FieldWF d f) : decodeField d (encodeField d f) = f := by
  have h := hd.unfold
  have sep : ∀ x, x ∈ [segmentTerminator, d.field, d.component, d.repetition, d.subcomponent] →
      x ∈ d.separators := fun _ hx => by simpa [Delimiters.separators] using hx
  unfold decodeField encodeField
  refine map_splitOn_intercalate _ _ _ _ hf.1 (fun r hr => ?_) (fun r hr => ?_)
  · -- no repetition separator inside a repetition
    obtain ⟨_, hr'⟩ := hf.2 r hr
    refine not_mem_intercalate (Ne.symm h.cr) fun l hl => ?_
    obtain ⟨c, hc, rfl⟩ := List.mem_map.1 hl
    obtain ⟨_, hc'⟩ := hr' c hc
    refine not_mem_intercalate h.rs fun l hl => ?_
    obtain ⟨v, hv, rfl⟩ := List.mem_map.1 hl
    exact not_mem_escape hd hk (sep _ (by simp)) (hc' v hv)
  · obtain ⟨hr0, hr'⟩ := hf.2 r hr
    refine map_splitOn_intercalate _ _ _ _ hr0 (fun c hc => ?_) (fun c hc => ?_)
    · obtain ⟨_, hc'⟩ := hr' c hc
      refine not_mem_intercalate h.cs fun l hl => ?_
      obtain ⟨v, hv, rfl⟩ := List.mem_map.1 hl
      exact not_mem_escape hd hk (sep _ (by simp)) (hc' v hv)
    · obtain ⟨hc0, hc'⟩ := hr' c hc
      exact map_splitOn_intercalate _ _ _ _ hc0
        (fun v hv => not_mem_escape hd hk (sep _ (by simp)) (hc' v hv))
        (fun v hv => unescape_escape d (fun h => hk _ h (escape_mem_all d)) v (hc' v hv).2)

/-- Proof device: read the fields of a segment back from the text after its ID. -/
def decodeFields (d : Delimiters) : List Char → List Field
  | [] => []
  | _ :: rest => (rest.splitOn d.field).map (decodeField d)

theorem decodeFields_encodeFields {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.all) {fields : List Field}
    (hf : ∀ f ∈ fields, FieldWF d f) : decodeFields d (encodeFields d fields) = fields := by
  have h := hd.unfold
  cases fields with
  | nil => rfl
  | cons f t =>
    unfold encodeFields
    rw [flatMap_cons_eq_intercalate _ _ _ (by simp)]
    exact map_splitOn_intercalate _ _ _ _ (by simp)
      (fun g hg => not_mem_encodeField hd hk (by simp [Delimiters.separators]) h.fr h.fc h.fs
        (hf g hg))
      (fun g hg => decodeField_encodeField hd hk (hf g hg))

theorem not_mem_encodeFields {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.all) {fields : List Field}
    (hf : ∀ f ∈ fields, FieldWF d f) : segmentTerminator ∉ encodeFields d fields := by
  have h := hd.unfold
  simp only [encodeFields, List.mem_flatMap, List.mem_cons, not_exists, not_and, not_or]
  exact fun f hfm => ⟨h.tf, not_mem_encodeField hd hk (by simp [Delimiters.separators]) h.tr h.tc
    h.ts (hf f hfm)⟩

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
  have hd := hm.delimiters_distinct
  have hk := hm.delimiters_not_escape_codes
  have hh := hm.header
  have hs := hm.segment
  obtain ⟨d, header, segments⟩ := m
  have h := hd.unfold
  have lines_ok : ∀ l ∈ encodeHeader d header :: segments.map (encodeSegment d),
      segmentTerminator ∉ l := by
    intro l hl
    simp only [List.mem_cons, List.mem_map] at hl
    rcases hl with rfl | ⟨s, hsm, rfl⟩
    · simp only [encodeHeader, mshId, Delimiters.encodingCharacters, List.cons_append,
        List.nil_append, List.mem_cons, not_or]
      refine ⟨by decide, by decide, by decide, h.tf, h.tc, h.tr, h.te, h.ts, ?_⟩
      simpa using not_mem_encodeFields hd hk hh
    · simp only [encodeSegment, List.mem_append, not_or]
      exact ⟨(hs s hsm).id_no_terminator, not_mem_encodeFields hd hk (hs s hsm).fields⟩
  have delims : delimitersOf (encode ⟨d, header, segments⟩) = d := by
    simp [encode, encodeHeader, mshId, Delimiters.encodingCharacters, delimitersOf]
  unfold decode
  simp only [delims]
  rw [encode, dropLast_flatMap_append _ _ (by simp),
    List.splitOn_intercalate _ lines_ok (by simp)]
  simp only [Message.mk.injEq, true_and]
  constructor
  · simp only [encodeHeader, mshId, Delimiters.encodingCharacters]
    exact decodeFields_encodeFields hd hk hh
  · rw [List.map_map]
    conv => rhs; rw [← List.map_id segments]
    refine List.map_congr_left fun s hsm => ?_
    have hw := hs s hsm
    simp only [Function.comp_apply, encodeSegment, id]
    rw [List.take_append_of_le_length (by simp [hw.id_length]),
      List.take_of_length_le (by simp [hw.id_length]),
      List.drop_append_of_le_length (by simp [hw.id_length]),
      List.drop_of_length_le (by simp [hw.id_length]), List.nil_append,
      decodeFields_encodeFields hd hk hw.fields]

end Hl7v2.Thm

import Hl7v2.Spec
import Hl7v2.Thm.Data.List

/-!
# Well-formedness, field by field and segment by segment

`Message.WF` states each rule over the whole message. The proofs read it one
field and one segment at a time, through `FieldWF` and `SegmentWF`.
`wf_iff_failures_nil` shows the catalogue checks exactly `Message.WF`.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- A value holds no segment terminator, and every escape sequence in it is one
§2.7 defines and holds no delimiter. -/
def ValueWF (d : Delimiters) (v : Subcomponent) : Prop :=
  Piece.char segmentTerminator ∉ v ∧ ∀ p ∈ v, p.isDefined ∧ p.NoDelimiter d

/-- Every level holds at least one element, and every value is well formed. -/
def FieldWF (d : Delimiters) (f : Field) : Prop :=
  f ≠ [] ∧ ∀ r ∈ f, r ≠ [] ∧ ∀ c ∈ r, c ≠ [] ∧ ∀ s ∈ c, ValueWF d s

/-- The segment ID is three characters with no segment terminator, and every field is
well formed. -/
structure SegmentWF (d : Delimiters) (s : Segment) : Prop where
  id_length : s.id.length = 3
  id_no_terminator : segmentTerminator ∉ s.id
  fields : ∀ f ∈ s.fields, FieldWF d f

/-- In a well-formed message, every field is well formed: the six field rules of
`Message.WF`, applied to one field.

Each rule is called on this field, then on each of its repetitions and components
(`fun r hr`, `fun c hc`), and the results are paired. -/
theorem _root_.Hl7v2.Spec.Message.WF.field {m : Message} (hm : m.WF) {f : Field} (hf : f ∈ m.fields) :
    FieldWF m.delimiters f :=
  ⟨hm.field_has_repetition f hf, fun r hr =>
    ⟨hm.repetition_has_component f hf r hr, fun c hc =>
      ⟨hm.component_has_subcomponent f hf r hr c hc, fun s hs =>
        ⟨hm.subcomponent_no_terminator f hf r hr c hc s hs, fun p hp =>
          ⟨hm.escape_sequence_defined f hf r hr c hc s hs p hp,
            hm.escape_sequence_no_delimiter f hf r hr c hc s hs p hp⟩⟩⟩⟩⟩

/-- In a well-formed message, every MSH field from MSH-3 on is well formed.

A header field is in `m.fields`, which starts with `m.header`
(`List.mem_append_left`), so `Message.WF.field` applies. -/
theorem _root_.Hl7v2.Spec.Message.WF.header {m : Message} (hm : m.WF) :
    ∀ f ∈ m.header, FieldWF m.delimiters f :=
  fun _ hf => hm.field (List.mem_append_left _ hf)

/-- In a well-formed message, every segment after MSH is well formed.

The two segment ID rules give `id_length` and `id_no_terminator`. A field of the
segment is in `m.fields`, which ends with the fields of every segment
(`List.mem_append_right`, `List.mem_flatMap`), so `Message.WF.field` gives `fields`. -/
theorem _root_.Hl7v2.Spec.Message.WF.segment {m : Message} (hm : m.WF) :
    ∀ s ∈ m.segments, SegmentWF m.delimiters s :=
  fun s hs => ⟨hm.segment_id_length s hs, hm.segment_id_no_terminator s hs,
    fun _ hf => hm.field (List.mem_append_right _ (List.mem_flatMap.2 ⟨s, hs, hf⟩))⟩

/-- **The catalogue checks exactly the well-formedness rules.** A message is
well formed when it breaks no rule of the catalogue. -/
theorem wf_iff_failures_nil {m : Message} : m.WF ↔ m.failures = [] := by
  simp only [Message.failures, List.map_eq_nil_iff, filter_eq_nil_iff, catalogue,
    List.mem_cons, List.not_mem_nil, or_false, forall_eq_or_imp, forall_eq,
    Bool.not_eq_false', decide_eq_true_eq]
  constructor
  · intro hm
    exact ⟨hm.1, hm.2, hm.3, hm.4, hm.5, hm.6, hm.7, hm.8, hm.9, hm.10⟩
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩
    exact ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩

instance (m : Message) : Decidable m.WF :=
  decidable_of_iff _ wf_iff_failures_nil.symm

end Hl7v2.Thm

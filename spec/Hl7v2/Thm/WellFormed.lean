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

/-- Every level holds at least one element, and every subcomponent is clean. -/
def FieldWF (d : Delimiters) (f : Field) : Prop :=
  f ≠ [] ∧ ∀ r ∈ f, r ≠ [] ∧ ∀ c ∈ r, c ≠ [] ∧ ∀ s ∈ c, Clean d s

structure SegmentWF (d : Delimiters) (s : Segment) : Prop where
  id_length : s.id.length = 3
  id_no_terminator : segmentTerminator ∉ s.id
  fields : ∀ f ∈ s.fields, FieldWF d f

theorem _root_.Hl7v2.Spec.Message.WF.field {m : Message} (hm : m.WF) {f : Field} (hf : f ∈ m.fields) :
    FieldWF m.delimiters f :=
  ⟨hm.field_has_repetition f hf, fun r hr =>
    ⟨hm.repetition_has_component f hf r hr, fun c hc =>
      ⟨hm.component_has_subcomponent f hf r hr c hc,
        hm.subcomponent_clean f hf r hr c hc⟩⟩⟩

theorem _root_.Hl7v2.Spec.Message.WF.header {m : Message} (hm : m.WF) :
    ∀ f ∈ m.header, FieldWF m.delimiters f :=
  fun _ hf => hm.field (List.mem_append_left _ hf)

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
    exact ⟨hm.1, hm.2, hm.3, hm.4, hm.5, hm.6, hm.7⟩
  · rintro ⟨h1, h2, h3, h4, h5, h6, h7⟩
    exact ⟨h1, h2, h3, h4, h5, h6, h7⟩

instance (m : Message) : Decidable m.WF :=
  decidable_of_iff _ wf_iff_failures_nil.symm

end Hl7v2.Thm

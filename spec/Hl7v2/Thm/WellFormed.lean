import Hl7v2.Spec

/-!
# Well-formedness, level by level

`Message.WF` states each rule over the whole message. The proofs read it one
component, repetition, field and segment at a time.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- A component holds a subcomponent, and no subcomponent holds a separator. -/
def ComponentWF (d : Delimiters) (c : Component) : Prop :=
  c ≠ [] ∧ ∀ s ∈ c, ∀ x ∈ d.separators, x ∉ s

/-- A repetition holds a component, and every component is well formed. -/
def RepetitionWF (d : Delimiters) (r : Repetition) : Prop :=
  r ≠ [] ∧ ∀ c ∈ r, ComponentWF d c

/-- A field holds a repetition, and every repetition is well formed. -/
def FieldWF (d : Delimiters) (f : Field) : Prop :=
  f ≠ [] ∧ ∀ r ∈ f, RepetitionWF d r

/-- In a well-formed message, every field is well formed. -/
theorem _root_.Hl7v2.Spec.Message.WF.field {m : Message} (hm : m.WF) {f : Field}
    (hf : f ∈ m.fields) : FieldWF m.delimiters f :=
  ⟨hm.field_has_repetition f hf, fun r hr =>
    ⟨hm.repetition_has_component f hf r hr, fun c hc =>
      ⟨hm.component_has_subcomponent f hf r hr c hc,
        hm.subcomponent_no_separator f hf r hr c hc⟩⟩⟩

/-- In a well-formed message, every MSH field from MSH-3 on is well formed. -/
theorem _root_.Hl7v2.Spec.Message.WF.header {m : Message} (hm : m.WF) :
    ∀ f ∈ m.header, FieldWF m.delimiters f :=
  fun _ hf => hm.field (List.mem_append_left _ hf)

/-- In a well-formed message, every field of a segment after MSH is well formed. -/
theorem _root_.Hl7v2.Spec.Message.WF.segment {m : Message} (hm : m.WF) :
    ∀ s ∈ m.segments, ∀ f ∈ s.fields, FieldWF m.delimiters f :=
  fun s hs _ hf => hm.field (List.mem_append_right _ (List.mem_flatMap.2 ⟨s, hs, hf⟩))

/-- Whether a message is well formed can be checked: every rule is decidable. -/
instance (m : Message) : Decidable m.WF :=
  decidable_of_iff
    (m.delimiters.separators.Nodup ∧ m.delimiters.escape ≠ segmentTerminator ∧
      (∀ s ∈ m.segments, s.id.length = 3) ∧ (∀ s ∈ m.segments, segmentTerminator ∉ s.id) ∧
      (∀ f ∈ m.fields, f ≠ []) ∧ (∀ f ∈ m.fields, ∀ r ∈ f, r ≠ []) ∧
      (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, c ≠ []) ∧
      ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ x ∈ m.delimiters.separators, x ∉ s)
    ⟨fun ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩ => ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩,
      fun h => ⟨h.1, h.2, h.3, h.4, h.5, h.6, h.7, h.8⟩⟩

end Hl7v2.Thm

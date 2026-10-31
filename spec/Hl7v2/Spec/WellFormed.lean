import Hl7v2.Spec.Escape
import Hl7v2.Spec.Message

/-!
# Well-formed messages

The conditions under which a message has exactly one encoding, one named rule
each. A rule is a statement about the message, and it is decidable: the same
rule is checked by `decide` in a proof and by `Message.failures` on a message.

An empty field is written as nothing. The message records it as one repetition
of one component of one empty subcomponent, so no level of a field is an empty
list; the three `…_has_…` rules say so.
-/

namespace Hl7v2.Spec

instance (d : Delimiters) : Decidable d.Distinct :=
  inferInstanceAs (Decidable d.all.Nodup)

/-- Every field of the message: MSH-3 onward, then the fields of each later segment. -/
def Message.fields (m : Message) : List Field :=
  m.header ++ m.segments.flatMap (·.fields)

structure Message.WF (m : Message) : Prop where
  /-- The delimiters are different characters. -/
  delimiters_distinct : m.delimiters.Distinct
  /-- No separator is an escape code ID, so no escape sequence holds a separator. -/
  separators_not_escape_codes : ∀ c ∈ escapeCodes, c ∉ m.delimiters.separators
  /-- A segment ID is three characters (§2.5.2). -/
  segment_id_length : ∀ s ∈ m.segments, s.id.length = 3
  /-- A segment ID does not contain the segment terminator. -/
  segment_id_no_terminator : ∀ s ∈ m.segments, segmentTerminator ∉ s.id
  /-- A field holds at least one repetition. -/
  field_has_repetition : ∀ f ∈ m.fields, f ≠ []
  /-- A repetition holds at least one component. -/
  repetition_has_component : ∀ f ∈ m.fields, ∀ r ∈ f, r ≠ []
  /-- A component holds at least one subcomponent. -/
  component_has_subcomponent : ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, c ≠ []
  /-- A subcomponent contains no segment terminator. -/
  subcomponent_no_terminator : ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, segmentTerminator ∉ s

/-- A named rule of `Message.WF`. The name is `well_formed_` and the field name. -/
structure Rule where
  name : String
  holds : Message → Bool

/-- Every rule of `Message.WF`, in field order. -/
def catalogue : List Rule :=
  [ ⟨"well_formed_delimiters_distinct", fun m => decide m.delimiters.Distinct⟩,
    ⟨"well_formed_separators_not_escape_codes",
      fun m => decide (∀ c ∈ escapeCodes, c ∉ m.delimiters.separators)⟩,
    ⟨"well_formed_segment_id_length", fun m => decide (∀ s ∈ m.segments, s.id.length = 3)⟩,
    ⟨"well_formed_segment_id_no_terminator",
      fun m => decide (∀ s ∈ m.segments, segmentTerminator ∉ s.id)⟩,
    ⟨"well_formed_field_has_repetition", fun m => decide (∀ f ∈ m.fields, f ≠ [])⟩,
    ⟨"well_formed_repetition_has_component",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, r ≠ [])⟩,
    ⟨"well_formed_component_has_subcomponent",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, c ≠ [])⟩,
    ⟨"well_formed_subcomponent_no_terminator",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, segmentTerminator ∉ s)⟩ ]

/-- The names of the rules the message breaks. -/
def Message.failures (m : Message) : List String :=
  (catalogue.filter fun rule => !rule.holds m).map (·.name)

end Hl7v2.Spec

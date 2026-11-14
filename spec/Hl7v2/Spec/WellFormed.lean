import Hl7v2.Spec.Message

/-!
# Well-formed messages

The rules a message must meet, one named rule each. A rule comes from a
statement of the standard, or from a fact the proof of `encode_injective`
needs (`one_text_one_meaning`); `docs/statements.md` records the second kind
under "Decisions". Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- Every field of the message: MSH-3 onward, then the fields of each later segment. -/
def Message.fields (m : Message) : List Field :=
  m.header ++ m.segments.flatMap (·.fields)

/-- A message that meets every rule of the specification. -/
structure Message.WF (m : Message) : Prop where
  /-- The segment terminator and the four separators are different characters. -/
  separators_distinct : m.delimiters.separators.Nodup
  /-- The escape character is not the segment terminator. -/
  escape_not_terminator : m.delimiters.escape ≠ segmentTerminator
  /-- "Each segment is identified by a unique three-character code known as the
  Segment ID." (`segment_id_is_three_characters`, §2.5.2) -/
  segment_id_length : ∀ s ∈ m.segments, s.id.length = 3
  /-- A segment ID does not hold the segment terminator. -/
  segment_id_no_terminator : ∀ s ∈ m.segments, segmentTerminator ∉ s.id
  /-- A field holds at least one repetition. -/
  field_has_repetition : ∀ f ∈ m.fields, f ≠ []
  /-- A repetition holds at least one component. -/
  repetition_has_component : ∀ f ∈ m.fields, ∀ r ∈ f, r ≠ []
  /-- A component holds at least one subcomponent. -/
  component_has_subcomponent : ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, c ≠ []
  /-- A subcomponent holds no separator and no segment terminator. -/
  subcomponent_no_separator :
    ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ x ∈ m.delimiters.separators, x ∉ s

end Hl7v2.Spec

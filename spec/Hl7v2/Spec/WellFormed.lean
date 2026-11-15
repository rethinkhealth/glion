import Hl7v2.Spec.Message

/-!
# Well-formed messages

The rules a message must meet, one named rule each. A rule comes from a
statement of the standard, or from a fact a proof needs.
Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- A message that meets every rule of the specification. -/
structure Message.WF (m : Message) : Prop where
  /-- "Each segment is identified by a unique three-character code known as the
  Segment ID." (`segment_id_is_three_characters`, §2.5.2) -/
  segment_id_length : ∀ s ∈ m.segments, s.id.length = 3

end Hl7v2.Spec

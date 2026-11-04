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

/-- A character, or an escape sequence §2.7 defines. -/
def Piece.isDefined : Piece → Bool
  | .char _ => true
  | .sequence code => isDefinedSequence code

/-- The escape code ID and data characters of an escape sequence; none for a character. -/
def Piece.code : Piece → List Char
  | .char _ => []
  | .sequence code => code

/-- No character of the escape code ID or data is a delimiter or the segment
terminator. -/
def Piece.NoDelimiter (d : Delimiters) (p : Piece) : Prop := ∀ x ∈ d.all, x ∉ p.code

instance (d : Delimiters) (p : Piece) : Decidable (p.NoDelimiter d) :=
  inferInstanceAs (Decidable (∀ x ∈ d.all, x ∉ p.code))

/-- Every field of the message: MSH-3 onward, then the fields of each later segment. -/
def Message.fields (m : Message) : List Field :=
  m.header ++ m.segments.flatMap (·.fields)

structure Message.WF (m : Message) : Prop where
  /-- The delimiters are different characters. -/
  delimiters_distinct : m.delimiters.Distinct
  /-- No delimiter is a character of an escape code the specification writes for a
  character (`F`, `S`, `T`, `R`, `E`, `X`, a hexadecimal digit), so no such sequence
  holds a delimiter. -/
  delimiters_not_code_characters : ∀ c ∈ codeCharacters, c ∉ m.delimiters.all
  /-- A segment ID is three characters (`segmentIdIsThreeCharacters`, §2.5.2). -/
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
  subcomponent_no_terminator :
    ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, Piece.char segmentTerminator ∉ s
  /-- Every escape sequence is one §2.7 defines (`definedEscapeSequences`). -/
  escape_sequence_defined : ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ p ∈ s, p.isDefined
  /-- No escape sequence holds a delimiter: "Escape sequences SHALL NOT contain
  nested escape sequences" (`noNestedEscapeSequences`, §2.7.1), and a separator would end the value. -/
  escape_sequence_no_delimiter :
    ∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ p ∈ s, p.NoDelimiter m.delimiters

/-- A named rule of `Message.WF`. The name is `well_formed_` and the field name. -/
structure Rule where
  name : String
  holds : Message → Bool

/-- Every rule of `Message.WF`, in field order. -/
def catalogue : List Rule :=
  [ ⟨"well_formed_delimiters_distinct", fun m => decide m.delimiters.Distinct⟩,
    ⟨"well_formed_delimiters_not_code_characters",
      fun m => decide (∀ c ∈ codeCharacters, c ∉ m.delimiters.all)⟩,
    ⟨"well_formed_segment_id_length", fun m => decide (∀ s ∈ m.segments, s.id.length = 3)⟩,
    ⟨"well_formed_segment_id_no_terminator",
      fun m => decide (∀ s ∈ m.segments, segmentTerminator ∉ s.id)⟩,
    ⟨"well_formed_field_has_repetition", fun m => decide (∀ f ∈ m.fields, f ≠ [])⟩,
    ⟨"well_formed_repetition_has_component",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, r ≠ [])⟩,
    ⟨"well_formed_component_has_subcomponent",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, c ≠ [])⟩,
    ⟨"well_formed_subcomponent_no_terminator",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, Piece.char segmentTerminator ∉ s)⟩,
    ⟨"well_formed_escape_sequence_defined",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ p ∈ s, p.isDefined)⟩,
    ⟨"well_formed_escape_sequence_no_delimiter",
      fun m => decide (∀ f ∈ m.fields, ∀ r ∈ f, ∀ c ∈ r, ∀ s ∈ c, ∀ p ∈ s, p.NoDelimiter m.delimiters)⟩ ]

/-- The names of the rules the message breaks. -/
def Message.failures (m : Message) : List String :=
  (catalogue.filter fun rule => !rule.holds m).map (·.name)

end Hl7v2.Spec

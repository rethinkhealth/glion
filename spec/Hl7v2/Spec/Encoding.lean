import Hl7v2.Spec.Message

/-!
# Encoding (§2.6.1)

How a sender writes a message as text: the construction of §2.6.1.0, one
function per level. Source: HL7 Version 2.8.1, Chapter 2 (Control).

Each value is written as it is, and every field is written: the `substitute`
lines of the construction (`delimiters_escaped_in_data`) and its "populated"
conditions (`trailing_not_populated_omitted`) are not formalized here.
-/

namespace Hl7v2.Spec

/-- The Segment ID of the message header segment. -/
def mshId : List Char := ['M', 'S', 'H']

/-- A component: its subcomponents, with the subcomponent separator between them
(`subcomponents_joined`, §2.6.1.0). -/
def encodeComponent (d : Delimiters) (c : Component) : List Char :=
  [d.subcomponent].intercalate c

/-- One occurrence of a field: its components, with the component separator
between them (`components_joined`, §2.6.1.0). -/
def encodeRepetition (d : Delimiters) (r : Repetition) : List Char :=
  [d.component].intercalate (r.map (encodeComponent d))

/-- A field: its occurrences, with the repetition separator between them
(`repetitions_joined`, §2.6.1.0). -/
def encodeField (d : Delimiters) (f : Field) : List Char :=
  [d.repetition].intercalate (f.map (encodeRepetition d))

/-- The fields of a segment: "insert field separator" before each field
(`field_separator_before_each_field`, §2.6.1.0), so the field separator "also
separates the segment ID from the first data field"
(`field_separator_after_segment_id`, §2.5.4). -/
def encodeFields (d : Delimiters) (fields : List Field) : List Char :=
  fields.flatMap fun f => d.field :: encodeField d f

/-- A segment: "insert segment.name", then its fields
(`segment_starts_with_its_id`, §2.6.1.0). -/
def encodeSegment (d : Delimiters) (s : Segment) : List Char :=
  s.id ++ encodeFields d s.fields

/-- MSH: "the field delimiter in the 4th character position, and the other
delimiters occurring as in the field called Encoding Characters, which is the
first field after the segment ID" (`delimiters_declared_in_msh`, §2.5.4), then
the fields from MSH-3 on. -/
def encodeHeader (d : Delimiters) (header : List Field) : List Char :=
  mshId ++ d.field :: d.encodingCharacters ++ encodeFields d header

/-- A message: MSH, then each segment, each followed by the segment terminator
(`segment_terminator_after_segment`, §2.6.1.0). -/
def encode (m : Message) : List Char :=
  (encodeHeader m.delimiters m.header :: m.segments.map (encodeSegment m.delimiters)).flatMap
    fun line => line ++ [segmentTerminator]

end Hl7v2.Spec

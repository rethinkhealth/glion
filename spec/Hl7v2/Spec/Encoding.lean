import Hl7v2.Spec.Message

/-!
# Encoding (§2.6.1)

How a sender writes a message as text. Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-! The sender's construction: each segment ID, then each field preceded by the field
separator, then the segment terminator. -/

def encodeField (d : Delimiters) (f : Field) : List Char :=
  [d.repetition].intercalate <| f.map fun r =>
    [d.component].intercalate <| r.map fun c =>
      [d.subcomponent].intercalate c

/-- "insert field separator" before each field. -/
def encodeFields (d : Delimiters) (fields : List Field) : List Char :=
  fields.flatMap fun f => d.field :: encodeField d f

def encodeSegment (d : Delimiters) (s : Segment) : List Char :=
  s.id ++ encodeFields d s.fields

/-- MSH: "the field delimiter in the 4th character position, and the other
delimiters occurring as in the field called Encoding Characters, which is the
first field after the segment ID" (§2.5.4). -/
def encodeHeader (d : Delimiters) (header : List Field) : List Char :=
  mshId ++ d.field :: d.encodingCharacters ++ encodeFields d header

/-- The message: MSH first, every segment followed by the segment terminator. -/
def encode (m : Message) : List Char :=
  (encodeHeader m.delimiters m.header :: m.segments.map (encodeSegment m.delimiters)).flatMap
    (· ++ [segmentTerminator])

end Hl7v2.Spec

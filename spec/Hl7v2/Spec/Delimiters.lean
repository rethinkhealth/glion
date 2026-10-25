/-!
# Delimiters (§2.5.4)

The segment terminator and the delimiters a message declares in MSH-1 and
MSH-2. Source: HL7 Version 2.x.x, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- "The segment terminator is always a carriage return (in ASCII, a hex 0D)."
"This value cannot be changed by implementers." -/
def segmentTerminator : Char := '\r'

/-- The delimiters a message declares in MSH-1 and MSH-2. -/
structure Delimiters where
  field : Char
  component : Char
  repetition : Char
  escape : Char
  subcomponent : Char
  deriving DecidableEq, Repr

/-- The suggested values from Figure 2-1. -/
def Delimiters.suggested : Delimiters := ⟨'|', '^', '~', '\\', '&'⟩

/-- MSH-2: "the component separator, repetition separator, escape character, and
subcomponent separator characters in that sequence" (§2.14.9.2). -/
def Delimiters.encodingCharacters (d : Delimiters) : List Char :=
  [d.component, d.repetition, d.escape, d.subcomponent]

/-- Every delimiter of the message, with the segment terminator. -/
def Delimiters.all (d : Delimiters) : List Char :=
  segmentTerminator :: d.field :: d.encodingCharacters

/-- All delimiters are different characters. The standard does not state this;
`ambiguous_without_distinct_delimiters` shows the encoding needs it. -/
def Delimiters.Distinct (d : Delimiters) : Prop := d.all.Nodup

/-- The characters that separate data: field, component, repetition and
subcomponent separators, and the segment terminator. The escape character is not
one; it may appear in data as part of an escape sequence (§2.7). -/
def Delimiters.separators (d : Delimiters) : List Char :=
  [segmentTerminator, d.field, d.component, d.repetition, d.subcomponent]

end Hl7v2.Spec

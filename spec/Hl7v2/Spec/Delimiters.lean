/-!
# Delimiters (§2.5.4)

The segment terminator and the delimiters a message declares in MSH-1 and
MSH-2. Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- "The segment terminator is always a carriage return (in ASCII, a hex 0D)."
"This value cannot be changed by implementers."
(`segment_terminator_is_carriage_return`, §2.5.4) -/
def segmentTerminator : Char := '\r'

/-- The delimiters a message declares: "the field separator, the component
separator, subcomponent separator, repetition separator, escape character"
(`message_delimiters`, §2.5.4). One value holds for the whole message
(`delimiters_hold_for_whole_message`). The truncation character is not modelled. -/
structure Delimiters where
  field : Char
  component : Char
  repetition : Char
  escape : Char
  subcomponent : Char
  deriving DecidableEq, Repr

/-- The suggested values of Figure 2-1 (`suggested_delimiters`, §2.5.4). -/
def Delimiters.suggested : Delimiters :=
  { field := '|', component := '^', repetition := '~', escape := '\\', subcomponent := '&' }

/-- MSH-2: "the component separator, repetition separator, escape character,
subcomponent separator", in that order (`encoding_characters_order`, §2.14.9.2). -/
def Delimiters.encodingCharacters (d : Delimiters) : List Char :=
  [d.component, d.repetition, d.escape, d.subcomponent]

/-- The characters a message is divided at: "the segment terminator, the field
separator, the component separator, subcomponent separator, repetition separator"
(`message_delimiters`, §2.5.4). The escape character divides nothing. -/
def Delimiters.separators (d : Delimiters) : List Char :=
  [segmentTerminator, d.field, d.component, d.repetition, d.subcomponent]

end Hl7v2.Spec

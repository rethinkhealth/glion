import Hl7v2.Spec.Delimiters

/-!
# Message structure (§2.5)

Segments, fields, repetitions, components and subcomponents.
Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-! Fields hold repetitions, repetitions hold components, components hold
subcomponents, and a subcomponent is text. Every level holds at least one
element: a field that is present but empty is one repetition of one component of
one empty subcomponent. -/

abbrev Subcomponent := List Char
abbrev Component := List Subcomponent
abbrev Repetition := List Component
abbrev Field := List Repetition

structure Segment where
  /-- "a unique three-character code known as the Segment ID" (§2.5.2). -/
  id : List Char
  fields : List Field
  deriving DecidableEq, Repr

/-- A message: the delimiters declared in MSH-1 and MSH-2, the MSH fields from
MSH-3 on, and the segments after MSH. -/
structure Message where
  delimiters : Delimiters
  header : List Field
  segments : List Segment
  deriving DecidableEq, Repr

def mshId : List Char := ['M', 'S', 'H']

end Hl7v2.Spec

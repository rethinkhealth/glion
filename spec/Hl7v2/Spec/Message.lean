import Hl7v2.Spec.Delimiters

/-!
# Message structure (§2.5)

Messages, segments, fields, repetitions, components and subcomponents.
Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- The data of a subcomponent: "A field is a string of characters"
(`field_is_characters`, §2.5.3). -/
abbrev Subcomponent := List Char

/-- "the components of a component are called sub-components"
(`component_holds_subcomponents`, §2.5.3.4). -/
abbrev Component := List Subcomponent

/-- One occurrence of a field: "a series of components"
(`field_holds_components`, §2.5.3.4). -/
abbrev Repetition := List Component

/-- A field and its occurrences (`field_may_repeat`, §2.5.3.6). No level below a
field repeats: "components and subcomponents may not repeat"
(`components_do_not_repeat`, §2.5.3.6). -/
abbrev Field := List Repetition

/-- "A segment is a logical grouping of data fields", identified by its Segment ID
(`segment_is_fields`, §2.5.2). -/
structure Segment where
  id : List Char
  fields : List Field
  deriving DecidableEq, Repr

/-- "A message is ... comprised of a group of segments in a defined sequence"
(`message_is_segments`, §2.5.1). The MSH segment comes first and is held apart:
its first two fields are the delimiters, `header` is its fields from MSH-3 on,
and `segments` are the segments after it. -/
structure Message where
  delimiters : Delimiters
  header : List Field
  segments : List Segment
  deriving DecidableEq, Repr

end Hl7v2.Spec

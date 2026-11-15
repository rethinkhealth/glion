import Hl7v2.Spec.Message

/-!
# A text represents a message (§2.5, §2.6.1)

When a text is the text of a message. Each level of a message has its own
relation, built from two shapes: items with a separator between them, and items
one after another. Source: HL7 Version 2.8.1, Chapter 2 (Control).

A value is represented by its own characters: escape sequences
(`delimiters_escaped_in_data`) are not formalized here. Every item is written:
a message with an empty field at the end of a segment and the message without
it are two messages, each with its own text (`trailing_not_populated_omitted`
is not formalized here).
-/

namespace Hl7v2.Spec

/-- `Separated sep R text items`: `text` is a text of each item, in order, with
`sep` between two items. `R t a` says that `t` is a text of the item `a`. -/
inductive Separated {α : Type} (sep : Char) (R : List Char → α → Prop) :
    List Char → List α → Prop
  /-- No item: the empty text. -/
  | nil : Separated sep R [] []
  /-- One item: its text. -/
  | one {t : List Char} {a : α} : R t a → Separated sep R t [a]
  /-- A first item, the separator, then the text of the items after it. -/
  | cons {t ts : List Char} {a b : α} {as : List α} :
      R t a → Separated sep R ts (b :: as) → Separated sep R (t ++ sep :: ts) (a :: b :: as)

/-- `Concatenated R text items`: `text` is a text of each item, in order, one
after another. -/
inductive Concatenated {α : Type} (R : List Char → α → Prop) : List Char → List α → Prop
  /-- No item: the empty text. -/
  | nil : Concatenated R [] []
  /-- A first item, then the text of the items after it. -/
  | cons {t ts : List Char} {a : α} {as : List α} :
      R t a → Concatenated R ts as → Concatenated R (t ++ ts) (a :: as)

/-- The Segment ID of the message header segment. -/
def mshId : List Char := ['M', 'S', 'H']

/-- A component: its subcomponents, each written as it is, with the subcomponent
separator between them (`subcomponents_joined`, §2.6.1.0). -/
def RepresentsComponent (d : Delimiters) (text : List Char) (c : Component) : Prop :=
  Separated d.subcomponent (fun t s => t = s) text c

/-- One occurrence of a field: its components, with the component separator
between them (`components_joined`, §2.6.1.0). -/
def RepresentsRepetition (d : Delimiters) (text : List Char) (r : Repetition) : Prop :=
  Separated d.component (RepresentsComponent d) text r

/-- A field: its occurrences, with the repetition separator between them
(`repetitions_joined`, §2.6.1.0). -/
def RepresentsField (d : Delimiters) (text : List Char) (f : Field) : Prop :=
  Separated d.repetition (RepresentsRepetition d) text f

/-- The fields of a segment: each field with the field separator before it
(`field_separator_before_each_field`, §2.6.1.0), so the field separator "also
separates the segment ID from the first data field"
(`field_separator_after_segment_id`, §2.5.4). -/
def RepresentsFields (d : Delimiters) (text : List Char) (fields : List Field) : Prop :=
  Concatenated (fun t f => ∃ u, t = d.field :: u ∧ RepresentsField d u f) text fields

/-- A segment: its Segment ID, then its fields
(`segment_starts_with_its_id`, §2.6.1.0). -/
def RepresentsSegment (d : Delimiters) (text : List Char) (s : Segment) : Prop :=
  ∃ u, text = s.id ++ u ∧ RepresentsFields d u s.fields

/-- The segments after MSH: each segment with the segment terminator after it
(`segment_terminator_after_segment`, §2.6.1.0). -/
def RepresentsSegments (d : Delimiters) (text : List Char) (segments : List Segment) : Prop :=
  Concatenated (fun t s => ∃ u, t = u ++ [segmentTerminator] ∧ RepresentsSegment d u s) text
    segments

/-- **A text represents a message.** MSH with "the field delimiter in the 4th
character position, and the other delimiters occurring as in the field called
Encoding Characters, which is the first field after the segment ID"
(`delimiters_declared_in_msh`, §2.5.4), the fields from MSH-3 on, the segment
terminator, then the segments after MSH. -/
def Represents (text : List Char) (m : Message) : Prop :=
  ∃ header segments,
    text = mshId ++ m.delimiters.field :: m.delimiters.encodingCharacters ++ header
        ++ segmentTerminator :: segments ∧
      RepresentsFields m.delimiters header m.header ∧
      RepresentsSegments m.delimiters segments m.segments

end Hl7v2.Spec

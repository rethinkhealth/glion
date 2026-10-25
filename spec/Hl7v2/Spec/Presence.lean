import Hl7v2.Spec.Message

/-!
# Fields that are not present (§2.6.2)

A recipient shall "treat fields and components that are expected but were not
included in a segment as not present". A field whose subcomponents are all empty
carries nothing, so trailing fields like that mean the same as no fields at all.
Source: HL7 Version 2.8.1, Chapter 2 (Control).
-/

namespace Hl7v2.Spec

/-- A field is present when some subcomponent holds a character. -/
def Field.isPresent (f : Field) : Bool :=
  f.any fun r => r.any fun c => c.any fun s => !s.isEmpty

/-- The fields with trailing fields that are not present removed. -/
def trimFields (fields : List Field) : List Field :=
  (fields.reverse.dropWhile (!·.isPresent)).reverse

end Hl7v2.Spec

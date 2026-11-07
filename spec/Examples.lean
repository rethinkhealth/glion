import Hl7v2.Spec

/-!
# Writing examples

Shorthands for examples in the lessons and the guide. They are not part of the
specification: `String.toList` depends on `Classical.choice`, which the axiom
audit of `Hl7v2` does not allow.
-/

namespace Hl7v2.Spec

/-- A value of data characters only: `data "SMITH"`. -/
def data (s : String) : List Piece := s.toList.map .char

end Hl7v2.Spec

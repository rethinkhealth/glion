import Hl7v2.Spec

/-!
# Delimiter facts
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- The distinct delimiters, one fact per pair. -/
structure PairwiseDistinct (d : Delimiters) : Prop where
  tf : segmentTerminator ≠ d.field
  tc : segmentTerminator ≠ d.component
  tr : segmentTerminator ≠ d.repetition
  te : segmentTerminator ≠ d.escape
  ts : segmentTerminator ≠ d.subcomponent
  fc : d.field ≠ d.component
  fr : d.field ≠ d.repetition
  fe : d.field ≠ d.escape
  fs : d.field ≠ d.subcomponent
  cr : d.component ≠ d.repetition
  ce : d.component ≠ d.escape
  cs : d.component ≠ d.subcomponent
  re : d.repetition ≠ d.escape
  rs : d.repetition ≠ d.subcomponent
  es : d.escape ≠ d.subcomponent

theorem _root_.Hl7v2.Spec.Delimiters.Distinct.unfold {d : Delimiters} (h : d.Distinct) : PairwiseDistinct d := by
  simp [Delimiters.Distinct, Delimiters.all, Delimiters.encodingCharacters] at h
  obtain ⟨⟨h1, h2, h3, h4, h5⟩, ⟨h6, h7, h8, h9⟩, ⟨h10, h11, h12⟩, ⟨h13, h14⟩, h15⟩ := h
  exact ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, h12, h13, h14, h15⟩

end Hl7v2.Thm

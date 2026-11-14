import Hl7v2.Spec

/-!
# Delimiter facts
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- The distinct separators, one fact per pair. -/
structure PairwiseDistinct (d : Delimiters) : Prop where
  tf : segmentTerminator ≠ d.field
  tc : segmentTerminator ≠ d.component
  tr : segmentTerminator ≠ d.repetition
  ts : segmentTerminator ≠ d.subcomponent
  fc : d.field ≠ d.component
  fr : d.field ≠ d.repetition
  fs : d.field ≠ d.subcomponent
  cr : d.component ≠ d.repetition
  cs : d.component ≠ d.subcomponent
  rs : d.repetition ≠ d.subcomponent

theorem pairwiseDistinct_of_nodup {d : Delimiters} (h : d.separators.Nodup) :
    PairwiseDistinct d := by
  simp [Delimiters.separators] at h
  obtain ⟨⟨h1, h2, h3, h4⟩, ⟨h5, h6, h7⟩, ⟨h8, h9⟩, h10⟩ := h
  exact ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩

end Hl7v2.Thm

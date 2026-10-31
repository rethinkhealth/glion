import Hl7v2.Spec
import Hl7v2.Thm.Encoding.Delimiters

/-!
# Reading a value back from its escape sequences

`unescape` exists only to carry the proof of `encode_injective`: it is not part
of the specification.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- Proof device: the delimiter an escape code ID stands for. -/
def unescapeCode (d : Delimiters) (code : Char) : Char :=
  if code = 'F' then d.field
  else if code = 'S' then d.component
  else if code = 'T' then d.subcomponent
  else if code = 'R' then d.repetition
  else d.escape

/-- Proof device: read a value back from the text a sender wrote. -/
def unescape (d : Delimiters) : List Char → List Char
  | [] => []
  | c :: rest =>
    if c = d.escape then
      match rest with
      | code :: _ :: rest' => unescapeCode d code :: unescape d rest'
      | _ => c :: rest
    else c :: unescape d rest

theorem unescape_escapeChar_append (d : Delimiters) (c : Char) (t : List Char) :
    unescape d (escapeChar d c ++ t) = c :: unescape d t := by
  unfold escapeChar
  split
  · simp [unescape, unescapeCode, *]
  split
  · simp [unescape, unescapeCode, *]
  split
  · simp [unescape, unescapeCode, *]
  split
  · simp [unescape, unescapeCode, *]
  split
  · simp [unescape, unescapeCode, *]
  · rename_i he
    simp only [List.singleton_append]
    rw [unescape.eq_def]
    simp [he]

theorem unescape_escape (d : Delimiters) (v : List Char) : unescape d (escape d v) = v := by
  induction v with
  | nil => rfl
  | cons c rest ih =>
    simp only [escape, List.flatMap_cons] at ih ⊢
    rw [unescape_escapeChar_append, ih]

/-- The escape character is not a separator. -/
theorem escape_not_mem_separators {d : Delimiters} (hd : d.Distinct) :
    d.escape ∉ d.separators := by
  have h := hd.unfold
  simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false, not_or]
  exact ⟨h.te.symm, h.fe.symm, h.ce.symm, h.re.symm, h.es⟩

/-- A separator never appears in a written value. -/
theorem not_mem_escape {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.separators) {x : Char} (hx : x ∈ d.separators)
    {v : List Char} (hv : segmentTerminator ∉ v) : x ∉ escape d v := by
  have he := escape_not_mem_separators hd
  have hxe : x ≠ d.escape := fun h => he (h ▸ hx)
  have hcode : ∀ k ∈ escapeCodes, x ≠ k := fun k hk' h => hk k hk' (h ▸ hx)
  simp only [escape, List.mem_flatMap, not_exists, not_and]
  intro c hc
  unfold escapeChar
  split
  · simp [hxe, hcode 'F' (by decide)]
  split
  · simp [hxe, hcode 'S' (by decide)]
  split
  · simp [hxe, hcode 'T' (by decide)]
  split
  · simp [hxe, hcode 'R' (by decide)]
  split
  · simp [hxe, hcode 'E' (by decide)]
  · simp only [List.mem_singleton]
    rintro rfl
    have hct : x ≠ segmentTerminator := fun h => hv (h ▸ hc)
    simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false] at hx
    rcases hx with h | h | h | h | h <;> simp_all

end Hl7v2.Thm

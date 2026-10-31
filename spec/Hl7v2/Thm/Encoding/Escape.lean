import Hl7v2.Spec
import Hl7v2.Thm.Encoding.Delimiters
import Hl7v2.Thm.WellFormed

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

/-- Proof device: the piece the text between two escape characters stands for. -/
def readCode (d : Delimiters) : List Char → Piece
  | [c] => if c ∈ escapeCodes then .char (unescapeCode d c) else .sequence [c]
  | code => .sequence code

/-- Proof device: read a value, with the code read so far when inside an escape
sequence. An escape character with no closing one is data. -/
def readAux (d : Delimiters) : Option (List Char) → List Char → List Piece
  | none, [] => []
  | some code, [] => .char d.escape :: code.map .char
  | none, c :: rest =>
    if c = d.escape then readAux d (some []) rest else .char c :: readAux d none rest
  | some code, c :: rest =>
    if c = d.escape then readCode d code :: readAux d none rest
    else readAux d (some (code ++ [c])) rest

/-- Proof device: read a value back from the text a sender wrote. -/
def unescape (d : Delimiters) (text : List Char) : List Piece := readAux d none text

theorem readAux_code (d : Delimiters) (acc code t : List Char) (h : d.escape ∉ code) :
    readAux d (some acc) (code ++ d.escape :: t) = readCode d (acc ++ code) :: readAux d none t := by
  induction code generalizing acc with
  | nil => simp [readAux]
  | cons c cs ih =>
    simp only [List.mem_cons, not_or] at h
    simp only [List.cons_append, readAux, Ne.symm h.1, ite_false]
    rw [ih _ h.2]
    simp

/-- The sequences for a delimiter are not among the other sequences §2.7 defines. -/
theorem isDefinedSequence_not_escapeCode {c : Char} (hc : c ∈ escapeCodes) :
    isDefinedSequence [c] = false := by
  simp only [escapeCodes, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl | rfl | rfl | rfl | rfl <;> decide

/-- The escape character is a delimiter. -/
theorem escape_mem_all (d : Delimiters) : d.escape ∈ d.all := by
  simp [Delimiters.all, Delimiters.encodingCharacters]

theorem unescape_escapePiece_append (d : Delimiters) (he : d.escape ∉ escapeCodes)
    (p : Piece) (hp : p.isDefined ∧ p.NoDelimiter d) (t : List Char) :
    readAux d none (escapePiece d p ++ t) = p :: readAux d none t := by
  have hF : 'F' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hS : 'S' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hT : 'T' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hR : 'R' ≠ d.escape := fun h => he (by rw [← h]; decide)
  have hE : 'E' ≠ d.escape := fun h => he (by rw [← h]; decide)
  cases p with
  | char c =>
    simp only [escapePiece, escapeChar]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    split
    · simp [readAux, readCode, unescapeCode, escapeCodes, *]
    · simp [readAux, *]
  | sequence code =>
    obtain ⟨hdef, hn⟩ := hp
    have hne : d.escape ∉ code := hn _ (escape_mem_all d)
    have : escapePiece d (.sequence code) ++ t = d.escape :: (code ++ d.escape :: t) := by
      simp [escapePiece]
    rw [this]
    simp only [readAux, ite_true]
    rw [readAux_code d [] code t hne]
    congr 1
    simp only [List.nil_append, readCode]
    split
    · rename_i c
      have : c ∉ escapeCodes := fun hm => by
        simp [Piece.isDefined, isDefinedSequence_not_escapeCode hm] at hdef
      simp [this]
    · rfl

theorem unescape_escape (d : Delimiters) (he : d.escape ∉ escapeCodes) (v : List Piece)
    (hv : ∀ p ∈ v, p.isDefined ∧ p.NoDelimiter d) : unescape d (escape d v) = v := by
  induction v with
  | nil => rfl
  | cons p ps ih =>
    simp only [unescape, escape, List.flatMap_cons] at ih ⊢
    rw [unescape_escapePiece_append d he p (hv p (by simp)),
      ih (fun q hq => hv q (List.mem_cons_of_mem _ hq))]

/-- The escape character is not a separator. -/
theorem escape_not_mem_separators {d : Delimiters} (hd : d.Distinct) :
    d.escape ∉ d.separators := by
  have h := hd.unfold
  simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false, not_or]
  exact ⟨h.te.symm, h.fe.symm, h.ce.symm, h.re.symm, h.es⟩

/-- A separator is a delimiter. -/
theorem mem_all_of_mem_separators {d : Delimiters} {x : Char} (hx : x ∈ d.separators) :
    x ∈ d.all := by
  simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false] at hx
  simp only [Delimiters.all, Delimiters.encodingCharacters, List.mem_cons, List.not_mem_nil,
    or_false]
  rcases hx with h | h | h | h | h <;> simp [h]

/-- A separator never appears in a written value. -/
theorem not_mem_escape {d : Delimiters} (hd : d.Distinct)
    (hk : ∀ c ∈ escapeCodes, c ∉ d.all) {x : Char} (hx : x ∈ d.separators)
    {v : List Piece} (hv : ValueWF d v) : x ∉ escape d v := by
  have he := escape_not_mem_separators hd
  have hxe : x ≠ d.escape := fun h => he (h ▸ hx)
  have hxa := mem_all_of_mem_separators hx
  have hcode : ∀ k ∈ escapeCodes, x ≠ k := fun k hk' h => hk k hk' (h ▸ hxa)
  simp only [escape, List.mem_flatMap, not_exists, not_and]
  intro p hp
  cases p with
  | sequence code =>
    have hn : x ∉ code := (hv.2 _ hp).2 x hxa
    simp [escapePiece, hxe, hn]
  | char c =>
    simp only [escapePiece]
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
      have hct : x ≠ segmentTerminator := fun h => hv.1 (h ▸ hp)
      simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false] at hx
      rcases hx with h | h | h | h | h <;> simp_all

end Hl7v2.Thm

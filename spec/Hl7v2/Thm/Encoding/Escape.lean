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
  | code =>
    match controlChar? code with
    | some c => .char c
    | none => .sequence code

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

theorem hexDigit_mem (n : Nat) : hexDigit n ∈ hexDigits := by
  have h : ∀ k, k < 16 → (hexDigits.drop k).headD '0' ∈ hexDigits := by decide
  exact h _ (Nat.mod_lt _ (by decide))

theorem hexValue_hexDigit : ∀ n, n < 16 → hexValue (hexDigit n) = n := by decide

/-- Reading the code a control character is written with gives the character. -/
theorem controlChar?_controlCode {c : Char} (hc : isControl c) :
    controlChar? (controlCode c) = some c := by
  have hlt : c.toNat < 32 := by simp [isControl] at hc; omega
  have hv : hexValue (hexDigit (c.toNat / 16)) * 16 + hexValue (hexDigit (c.toNat % 16)) = c.toNat := by
    rw [hexValue_hexDigit _ (by omega), hexValue_hexDigit _ (Nat.mod_lt _ (by decide))]
    omega
  simp only [controlCode, controlChar?, isHexDigit, hexDigit_mem, decide_true, Bool.true_and, hv,
    Char.ofNat_toNat, hc, ite_true]

theorem eq_of_controlChar?_eq_some {code : List Char} {c : Char}
    (h : controlChar? code = some c) : ∃ a b, code = ['X', a, b] := by
  unfold controlChar? at h
  split at h
  · exact ⟨_, _, rfl⟩
  · simp at h

/-- A defined sequence is read back as itself. -/
theorem readCode_of_defined (d : Delimiters) {code : List Char}
    (h : isDefinedSequence code = true) : readCode d code = .sequence code := by
  unfold readCode
  split
  · rename_i c
    have : c ∉ escapeCodes := fun hm => by simp [isDefinedSequence_not_escapeCode hm] at h
    simp [this]
  · split
    · rename_i c hc
      obtain ⟨a, b, rfl⟩ := eq_of_controlChar?_eq_some hc
      simp [isDefinedSequence, hc] at h
    · rfl

/-- The escape character is a delimiter. -/
theorem escape_mem_all (d : Delimiters) : d.escape ∈ d.all := by
  simp [Delimiters.all, Delimiters.encodingCharacters]

theorem readCode_controlCode (d : Delimiters) {c : Char} (hc : isControl c = true) :
    readCode d (controlCode c) = .char c := by
  have h := controlChar?_controlCode hc
  simp only [controlCode] at h ⊢
  simp [readCode, h]

/-- Every character of the code a control character is written with is a code
character. -/
theorem mem_codeCharacters_of_mem_controlCode {c y : Char} (hy : y ∈ controlCode c) :
    y ∈ codeCharacters := by
  simp only [controlCode, List.mem_cons, List.not_mem_nil, or_false] at hy
  simp only [codeCharacters, List.mem_append, List.mem_cons]
  rcases hy with rfl | rfl | rfl
  · simp
  · exact Or.inr (Or.inr (hexDigit_mem _))
  · exact Or.inr (Or.inr (hexDigit_mem _))

theorem unescape_escapePiece_append (d : Delimiters) (he : d.escape ∉ codeCharacters)
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
    split
    · rename_i hc
      have hne : d.escape ∉ controlCode c := fun hm => he (mem_codeCharacters_of_mem_controlCode hm)
      have : (d.escape :: controlCode c ++ [d.escape]) ++ t = d.escape :: (controlCode c ++ d.escape :: t) := by
        simp
      rw [this]
      simp only [readAux, ite_true]
      rw [readAux_code d [] (controlCode c) t hne, List.nil_append, readCode_controlCode d hc]
    · simp [readAux, *]
  | sequence code =>
    obtain ⟨hdef, hn⟩ := hp
    have hne : d.escape ∉ code := hn _ (escape_mem_all d)
    have : escapePiece d (.sequence code) ++ t = d.escape :: (code ++ d.escape :: t) := by
      simp [escapePiece]
    rw [this]
    simp only [readAux, ite_true]
    rw [readAux_code d [] code t hne, List.nil_append, readCode_of_defined d hdef]

theorem unescape_escape (d : Delimiters) (he : d.escape ∉ codeCharacters) (v : List Piece)
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
    (hk : ∀ c ∈ codeCharacters, c ∉ d.all) {x : Char} (hx : x ∈ d.separators)
    {v : List Piece} (hv : ValueWF d v) : x ∉ escape d v := by
  have he := escape_not_mem_separators hd
  have hxe : x ≠ d.escape := fun h => he (h ▸ hx)
  have hxa := mem_all_of_mem_separators hx
  have hcode : ∀ k ∈ codeCharacters, x ≠ k := fun k hk' h => hk k hk' (h ▸ hxa)
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
    split
    · have hnc : x ∉ controlCode c := fun hm => hcode x (mem_codeCharacters_of_mem_controlCode hm) rfl
      simp [hxe, hnc]
    · simp only [List.mem_singleton]
      rintro rfl
      have hct : x ≠ segmentTerminator := fun h => hv.1 (h ▸ hp)
      simp only [Delimiters.separators, List.mem_cons, List.not_mem_nil, or_false] at hx
      rcases hx with h | h | h | h | h <;> simp_all

end Hl7v2.Thm

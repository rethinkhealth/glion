import Hl7v2.Spec
import Hl7v2.Thm.Encoding.Decode

/-!
# The encoding is unambiguous

Two well-formed messages with the same encoding are the same message
(`encode_injective`), so the text of a well-formed message has exactly one
meaning. Distinct delimiters are needed for this: without them, two different
messages share an encoding (`ambiguous_without_distinct_delimiters`). So is
escaping: a sender that writes a delimiter in data as itself writes two
different fields as one text (`ambiguous_without_escaping`).
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- **The encoding is unambiguous.** Two well-formed messages with the same text
are the same message. -/
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]

/-- **Distinct delimiters are needed.** With the component separator equal to the
field separator, a field of two components and two fields of one component
share one encoding: `MSH|||~\&␍PID|a|b␍`. -/
theorem ambiguous_without_distinct_delimiters :
    let d : Delimiters := { Delimiters.suggested with component := '|' }
    let twoComponents : Message := ⟨d, [], [⟨['P', 'I', 'D'], [[[[[.char 'a']], [[.char 'b']]]]]⟩]⟩
    let twoFields : Message := ⟨d, [], [⟨['P', 'I', 'D'], [[[[[.char 'a']]]], [[[[.char 'b']]]]]⟩]⟩
    encode twoComponents = encode twoFields ∧ twoComponents ≠ twoFields := by
  decide

/-- **Escaping is needed** (`delimiters_escaped_in_data`, §2.7.1). A sender that
writes each character of a value as itself, and otherwise writes a field as
`encodeField` does, writes the component `a^b` and the two components `a` and `b`
as one text: `a^b`. -/
theorem ambiguous_without_escaping :
    let d := Delimiters.suggested
    let unescaped : List Piece → List Char := List.flatMap fun
      | .char c => [c]
      | .sequence code => escapePiece d (.sequence code)
    let write (f : Field) : List Char :=
      [d.repetition].intercalate <| f.map fun r =>
        [d.component].intercalate <| r.map fun c =>
          [d.subcomponent].intercalate (c.map unescaped)
    let oneComponent : Field := [[[[.char 'a', .char '^', .char 'b']]]]
    let twoComponents : Field := [[[[.char 'a']], [[.char 'b']]]]
    write oneComponent = write twoComponents ∧ oneComponent ≠ twoComponents := by
  decide

end Hl7v2.Thm

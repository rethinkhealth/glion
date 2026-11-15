import Hl7v2.Thm.Encoding.Decode
import Hl7v2.Thm.Represents

/-!
# One text, one meaning

A text represents at most one well-formed message.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- Two well-formed messages written as the same text are the same message. -/
theorem encode_injective {m₁ m₂ : Message} (h₁ : m₁.WF) (h₂ : m₂.WF)
    (h : encode m₁ = encode m₂) : m₁ = m₂ := by
  rw [← decode_encode h₁, h, decode_encode h₂]

/-- **One text, one meaning** (`one_text_one_meaning`). Two well-formed messages
that one text represents are the same message. -/
theorem represents_message_unique {text : List Char} {m₁ m₂ : Message} (h₁ : m₁.WF)
    (h₂ : m₂.WF) (r₁ : Represents text m₁) (r₂ : Represents text m₂) : m₁ = m₂ :=
  encode_injective h₁ h₂
    (((represents_iff text m₁).1 r₁).symm.trans ((represents_iff text m₂).1 r₂))

end Hl7v2.Thm

import Hl7v2.Spec

/-!
# Theorems about the encoding

What the text of every message looks like. Each theorem is a statement of the
standard about the text, proved of `encode`.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-- The text of every message starts with `MSH`
(`segment_starts_with_its_id`, §2.6.1.0). -/
theorem encode_starts_with_msh (m : Message) : (encode m).take 3 = mshId := rfl

/-- "the field delimiter in the 4th character position"
(`delimiters_declared_in_msh`, §2.5.4). -/
theorem field_separator_is_fourth_character (m : Message) :
    ((encode m).drop 3).take 1 = [m.delimiters.field] := rfl

/-- "the other delimiters occurring as in the field called Encoding Characters,
which is the first field after the segment ID"
(`delimiters_declared_in_msh`, §2.5.4). -/
theorem encoding_characters_follow_field_separator (m : Message) :
    ((encode m).drop 4).take 4 = m.delimiters.encodingCharacters := rfl

end Hl7v2.Thm

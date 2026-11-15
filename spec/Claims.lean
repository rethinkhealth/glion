import Hl7v2

/-!
# What the specification claims

The statement of each headline theorem and the axioms its proof trusts.
`lake build` fails when one of them changes, so a pull request that changes a
claim shows the change here.
-/

open Hl7v2.Spec Hl7v2.Thm

/-- info: encode_represents : ∀ (m : Message), Represents (encode m) m -/
#guard_msgs in
#check @encode_represents

/-- info: 'Hl7v2.Thm.encode_represents' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms encode_represents

/--
info: @represents_text_unique : ∀ {t₁ t₂ : List Char} {m : Message}, Represents t₁ m → Represents t₂ m → t₁ = t₂
-/
#guard_msgs in
#check @represents_text_unique

/-- info: 'Hl7v2.Thm.represents_text_unique' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms represents_text_unique

/--
info: @represents_message_unique : ∀ {text : List Char} {m₁ m₂ : Message},
  m₁.WF → m₂.WF → Represents text m₁ → Represents text m₂ → m₁ = m₂
-/
#guard_msgs in
#check @represents_message_unique

/-- info: 'Hl7v2.Thm.represents_message_unique' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms represents_message_unique

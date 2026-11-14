import Hl7v2

/-!
# What the specification claims

The statement of each headline theorem and the axioms its proof trusts.
`lake build` fails when one of them changes, so a pull request that changes a
claim shows the change here.
-/

open Hl7v2.Spec Hl7v2.Thm

/-- info: @encode_injective : ∀ {m₁ m₂ : Message}, m₁.WF → m₂.WF → encode m₁ = encode m₂ → m₁ = m₂ -/
#guard_msgs in
#check @encode_injective

/-- info: 'Hl7v2.Thm.encode_injective' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms encode_injective

import Hl7v2

/-!
# What the specification claims

Each headline theorem's statement, the axioms its proof trusts, and the names of
the well-formedness rules. `lake build` fails when any of them changes, so a PR
that changes a claim shows the change here.
-/

open Hl7v2.Spec Hl7v2.Thm

/-- info: @encode_injective : ∀ {m₁ m₂ : Message}, m₁.WF → m₂.WF → encode m₁ = encode m₂ → m₁ = m₂ -/
#guard_msgs in
#check @encode_injective

/-- info: 'Hl7v2.Thm.encode_injective' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms encode_injective

/--
info: ambiguous_without_distinct_delimiters : have d :=
  have __src := Delimiters.suggested;
  { field := __src.field, component := '|', repetition := __src.repetition, escape := __src.escape,
    subcomponent := __src.subcomponent };
have twoComponents :=
  { delimiters := d, header := [],
    segments := [{ id := ['P', 'I', 'D'], fields := [[[[[Piece.char 'a']], [[Piece.char 'b']]]]] }] };
have twoFields :=
  { delimiters := d, header := [],
    segments := [{ id := ['P', 'I', 'D'], fields := [[[[[Piece.char 'a']]]], [[[[Piece.char 'b']]]]] }] };
encode twoComponents = encode twoFields ∧ twoComponents ≠ twoFields
-/
#guard_msgs in
#check @ambiguous_without_distinct_delimiters

/-- info: 'Hl7v2.Thm.ambiguous_without_distinct_delimiters' does not depend on any axioms -/
#guard_msgs in
#print axioms ambiguous_without_distinct_delimiters

/-- info: @wf_iff_failures_nil : ∀ {m : Message}, m.WF ↔ m.failures = [] -/
#guard_msgs in
#check @wf_iff_failures_nil

/-- info: 'Hl7v2.Thm.wf_iff_failures_nil' depends on axioms: [propext, Quot.sound] -/
#guard_msgs in
#print axioms wf_iff_failures_nil

/--
info: ["well_formed_delimiters_distinct", "well_formed_delimiters_not_escape_codes", "well_formed_segment_id_length",
 "well_formed_segment_id_no_terminator", "well_formed_field_has_repetition", "well_formed_repetition_has_component",
 "well_formed_component_has_subcomponent", "well_formed_subcomponent_no_terminator",
 "well_formed_escape_sequence_defined", "well_formed_escape_sequence_no_delimiter"]
-/
#guard_msgs in
#eval catalogue.map (·.name)

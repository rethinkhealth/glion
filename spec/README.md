# HL7v2 specification in Lean (proof of concept)

A machine-checked statement of the HL7v2 encoding rules. It uses only HL7v2's own terms and rules, cited from HL7 Version 2.8.1, Chapter 2, and assumes nothing about any implementation: there is no parser, validator or serializer in it.

## Layout

The layout follows [cedar-spec](https://github.com/cedar-policy/cedar-spec/tree/main/cedar-lean): definitions and proofs live in separate trees, and each topic has a short file of headline theorems with its supporting lemmas in a folder beside it.

| Module                  | Contents                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Hl7v2.Spec.Delimiters` | The segment terminator and the delimiters declared in MSH-1 and MSH-2 (§2.5.4)                                         |
| `Hl7v2.Spec.Message`    | Segments, fields, repetitions, components, subcomponents (§2.5)                                                        |
| `Hl7v2.Spec.Encoding`   | How a sender writes a message as text (§2.6.1)                                                                         |
| `Hl7v2.Spec.WellFormed` | The conditions under which a message has exactly one encoding, one named rule each, and the catalogue that checks them |
| `Hl7v2.Spec.Presence`   | Fields that are not present (§2.6.2)                                                                                   |
| `Hl7v2.Thm.WellFormed`  | The catalogue checks exactly the well-formedness rules                                                                 |
| `Hl7v2.Thm.Encoding`    | Headline theorems about the encoding                                                                                   |
| `Hl7v2.Thm.Encoding.*`  | Lemmas for those theorems, and `decode`, which exists only to carry the proof                                          |
| `Hl7v2.Thm.Data.List`   | Facts about joining and splitting lists of characters                                                                  |

`Hl7v2.Spec` and `Hl7v2.Thm` import their folders; `Hl7v2` imports both.

## What is proved

- **`Hl7v2.Thm.encode_injective`**: two well-formed messages with the same encoding are the same message. Every well-formed text has exactly one meaning.
- **`Hl7v2.Thm.ambiguous_without_distinct_delimiters`**: if the component separator equals the field separator, `MSH|||~\&␍PID|a|b␍` is the encoding of two different messages.

- **`Hl7v2.Thm.wf_iff_failures_nil`**: a message is well formed exactly when `Message.failures` names no rule. The catalogue and the definition cannot drift apart.

All three use only Lean's standard axioms (`propext`, `Quot.sound`).

## The rules

`Message.WF` is a list of named rules. Each is decidable, so the same rule is checked by `decide` inside a proof and by `Message.failures` on a message, which returns the names of the rules it breaks.

| Rule                                     | Says                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| `well_formed_delimiters_distinct`        | The delimiters are different characters              |
| `well_formed_segment_id_length`          | A segment ID is three characters (§2.5.2)            |
| `well_formed_segment_id_no_terminator`   | A segment ID does not contain the segment terminator |
| `well_formed_field_has_repetition`       | A field holds at least one repetition                |
| `well_formed_repetition_has_component`   | A repetition holds at least one component            |
| `well_formed_component_has_subcomponent` | A component holds at least one subcomponent          |
| `well_formed_subcomponent_clean`         | A subcomponent contains no separator                 |

An empty field is written as nothing; the message records it as one repetition of one component of one empty subcomponent, which is why no level is an empty list.

## Decisions the specification makes

The standard's text leaves some things open. Where the proofs need a rule, the specification states it and says why.

- **Distinct delimiters.** The standard suggests `|^~\&` but never says the delimiters must differ. The specification requires it: `ambiguous_without_distinct_delimiters` shows the encoding is ambiguous otherwise.

## Not yet covered

- Escape sequences (§2.7). Until then, well-formed data contains no separator character.
- What senders may omit and receivers must accept (§2.6.1, §2.6.2), and null values (§2.5.3).
- The truncation character (§2.5.4, v2.7 and later), batches (§2.10), character sets.
- Message structure: segment order and groups.

## Learning and reviewing

[GUIDE.md](GUIDE.md) is a path for learning enough Lean to read this specification, and a checklist for reviewing a change to it.

## What CI checks

`Statements.lean` records each headline theorem's statement, the axioms its proof uses, and the rule names. `lake build` fails when any of them changes, so a change to what the specification claims always shows as a diff to that file, and the PR must explain it. A proof can change freely as long as the build passes.

The `Spec` workflow also runs an axiom audit over every declaration (only `propext` and `Quot.sound` are allowed, so `sorry`, `native_decide` and new axioms fail) and replays every proof in `leanchecker`, a second kernel.

## The specification as a program

`Oracle.lean` builds the `oracle` program: it reads one message per line as JSON and answers with its encoding (`encode`) and the rules it breaks (`Message.failures`).

```sh
lake build oracle
echo '{"delimiters":"|^~\\&","header":[],"segments":[]}' | .lake/build/bin/oracle
# {"failures":[],"text":"MSH|^~\\&\r"}
```

[`differential/`](../differential) runs glion against it.

## Running

```sh
cd spec && lake build   # checks every proof and the statements
```

Requires the Lean toolchain named in `lean-toolchain` ([elan](https://github.com/leanprover/elan) installs it).

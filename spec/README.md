# HL7v2 specification in Lean

A machine-checked statement of HL7 Version 2.8.1, Chapter 2 (Control). It uses only HL7v2's own terms and rules, and assumes nothing about any implementation: there is no parser, validator or serializer in it.

The specification is built from scratch, one lesson at a time. Each lesson takes a few statements of the standard, writes them in Lean, and explains the Lean it needs on the way. A reader who follows the lessons in order ends with the whole specification and can read every line of it.

## How it is built

1. **Statements first.** [`docs/statements.md`](docs/statements.md) lists what Chapter 2 says, sentence by sentence, each with a name, its section and its quoted text. Nothing is written in Lean before its statement is in that list.
2. **One lesson per step.** A lesson formalizes a few statements, and marks them in the list. The lessons are indexed in [`docs/README.md`](docs/README.md).
3. **Every rule has a source.** A rule of the specification is either a statement of the standard, or a fact a proof needs. A rule of the second kind is recorded under "Decisions" in the statements list, with the reason.

## What is proved

- **`Hl7v2.Thm.encode_injective`**: two well-formed messages written as the same text are the same message. The standard relies on this and never states it (`one_text_one_meaning`).
- **`Hl7v2.Thm.encode_starts_with_msh`**, **`field_separator_is_fourth_character`**, **`encoding_characters_follow_field_separator`**: the text of every message starts with `MSH`, its field separator and its encoding characters.

All use only Lean's standard axioms (`propext`, `Quot.sound`).

## The rules

`Message.WF` holds the rules a message must meet. Each is decidable, so `decide` checks them on a message.

| Rule                         | Says                                                         | Source               |
| ---------------------------- | ------------------------------------------------------------ | -------------------- |
| `separators_distinct`        | The segment terminator and the four separators are different | `encode_injective`   |
| `escape_not_terminator`      | The escape character is not the segment terminator           | `encode_injective`   |
| `segment_id_length`          | A Segment ID has three characters                            | the standard, §2.5.2 |
| `segment_id_no_terminator`   | A Segment ID does not hold the segment terminator            | `encode_injective`   |
| `field_has_repetition`       | A field holds at least one repetition                        | `encode_injective`   |
| `repetition_has_component`   | A repetition holds at least one component                    | `encode_injective`   |
| `component_has_subcomponent` | A component holds at least one subcomponent                  | `encode_injective`   |
| `subcomponent_no_separator`  | A subcomponent holds no separator and no segment terminator  | `encode_injective`   |

## Layout

The layout follows [cedar-spec](https://github.com/cedar-policy/cedar-spec/tree/main/cedar-lean): definitions and proofs live in separate trees.

| Path                 | Holds                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `Hl7v2/Spec/`        | Definitions: the statements of the standard                                 |
| `Hl7v2/Thm/`         | Theorems about the definitions, and their proofs                            |
| `docs/statements.md` | The statements of Chapter 2, and which are formal                           |
| `Claims.lean`        | The statement and the axioms of each headline theorem, checked by the build |
| `docs/`              | The lessons                                                                 |
| `practice/`          | Your own files while following a lesson; Git ignores it                     |
| `scripts/`           | `check-lessons.py`, which compiles the Lean blocks of every lesson          |

## Running

```sh
cd spec && lake build   # checks every definition and every proof
```

Requires the Lean toolchain named in `lean-toolchain` ([elan](https://github.com/leanprover/elan) installs it).

## What CI checks

The `Spec` workflow builds the library and `Claims.lean`, which fails when the statement or the axioms of a headline theorem change, replays every proof in `leanchecker`, a second kernel, and runs an axiom audit over every declaration: only `propext` and `Quot.sound` are allowed, so `sorry`, `native_decide` and new axioms fail.

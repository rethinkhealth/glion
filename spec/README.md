# HL7v2 specification in Lean (proof of concept)

A machine-checked statement of the HL7v2 encoding rules. It uses only HL7v2's own terms and rules, cited from HL7 Version 2.8.1, Chapter 2, and assumes nothing about any implementation: there is no parser, validator or serializer in it.

## Layout

The layout follows [cedar-spec](https://github.com/cedar-policy/cedar-spec/tree/main/cedar-lean): definitions and proofs live in separate trees, and each topic has a short file of headline theorems with its supporting lemmas in a folder beside it.

| Module                  | Contents                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Hl7v2.Spec.Delimiters` | The segment terminator and the delimiters declared in MSH-1 and MSH-2 (§2.5.4)                                         |
| `Hl7v2.Spec.Message`    | Segments, fields, repetitions, components, subcomponents (§2.5)                                                        |
| `Hl7v2.Spec.Escape`     | A value as characters and escape sequences, the sequences §2.7 defines, and how a sender writes a value (§2.7)         |
| `Hl7v2.Spec.Encoding`   | How a sender writes a message as text (§2.6.1)                                                                         |
| `Hl7v2.Spec.WellFormed` | The conditions under which a message has exactly one encoding, one named rule each, and the catalogue that checks them |
| `Hl7v2.Spec.Presence`   | Fields that are not present (§2.6.2)                                                                                   |
| `Hl7v2.Thm.WellFormed`  | The catalogue checks exactly the well-formedness rules                                                                 |
| `Hl7v2.Thm.Encoding`    | Headline theorems about the encoding                                                                                   |
| `Hl7v2.Thm.Encoding.*`  | Lemmas for those theorems, and `decode` and `unescape`, which exist only to carry the proof                            |
| `Hl7v2.Thm.Data.List`   | Facts about joining and splitting lists of characters                                                                  |

`Hl7v2.Spec` and `Hl7v2.Thm` import their folders; `Hl7v2` imports both.

## What is proved

- **`Hl7v2.Thm.encode_injective`**: two well-formed messages with the same encoding are the same message. Every well-formed text has exactly one meaning.
- **`Hl7v2.Thm.ambiguous_without_distinct_delimiters`**: if the component separator equals the field separator, `MSH|||~\&␍PID|a|b␍` is the encoding of two different messages.
- **`Hl7v2.Thm.ambiguous_without_escaping`**: a sender that writes a delimiter in data as itself writes the component `a^b` and the two components `a` and `b` as one text, `a^b`.

- **`Hl7v2.Thm.wf_iff_failures_nil`**: a message is well formed exactly when `Message.failures` names no rule. The catalogue and the definition cannot drift apart.

All four use only Lean's standard axioms (`propext`, `Quot.sound`).

## The rules

`Message.WF` is a list of named rules. Each is decidable, so the same rule is checked by `decide` inside a proof and by `Message.failures` on a message, which returns the names of the rules it breaks.

| Rule                                         | Says                                                                |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `well_formed_delimiters_distinct`            | The delimiters are different characters                             |
| `well_formed_delimiters_not_code_characters` | No delimiter is `F`, `S`, `T`, `R`, `E`, `X` or a hexadecimal digit |
| `well_formed_segment_id_length`              | A segment ID is three characters (§2.5.2)                           |
| `well_formed_segment_id_no_terminator`       | A segment ID does not contain the segment terminator                |
| `well_formed_field_has_repetition`           | A field holds at least one repetition                               |
| `well_formed_repetition_has_component`       | A repetition holds at least one component                           |
| `well_formed_component_has_subcomponent`     | A component holds at least one subcomponent                         |
| `well_formed_subcomponent_no_terminator`     | A subcomponent contains no segment terminator                       |
| `well_formed_escape_sequence_defined`        | Every escape sequence is one §2.7 defines                           |
| `well_formed_escape_sequence_no_delimiter`   | No escape sequence holds a delimiter (§2.7.1)                       |

An empty field is written as nothing; the message records it as one repetition of one component of one empty subcomponent, which is why no level is an empty list.

## Decisions the specification makes

The standard's text leaves some things open. Where the proofs need a rule, the specification states it and says why.

- **Distinct delimiters.** The standard suggests `|^~\&` but never says the delimiters must differ. The specification requires it: `ambiguous_without_distinct_delimiters` shows the encoding is ambiguous otherwise.
- **Delimiters are not code characters.** A delimiter in data is written as an escape sequence such as `\F\` (§2.7.1), and a control character as `\X0A\`. With `F` as a separator, `\F\` would split where it stands; with `F` as the escape character, a reader cannot find where `\F\` ends. So no delimiter is `F`, `S`, `T`, `R`, `E`, `X` or a hexadecimal digit.
- **A value holds characters and escape sequences apart.** A subcomponent is a list of pieces: a character of data, or one of the sequences §2.7.2 to §2.7.8 define (truncation, character sets, highlighting, formatted text, local). The escape character in data is written `\E\`, so the data `\H\` (`\E\H\E\`) and the highlighting command `\H\` are two values with two texts.
- **Hexadecimal data is carried, not read, except for control characters.** §2.7.6 leaves the meaning of `\Xdd…\` to an agreement between sender and receiver, so the specification keeps `\X41\` and `\XC3A9\` as sequences. A control character other than the segment terminator (U+0000 to U+001F) is the one character that has no other way to be written safely, since many receivers end a segment at a line feed: it is written `\X0A\`, and `\X0A\` is that character, not a sequence. A carriage return is still not allowed in data, in any form. **Planned:** read no hexadecimal data at all, control characters included, and forbid every control character in data, as the carriage return is now (`well_formed_subcomponent_no_terminator` becomes a rule over all of U+0000 to U+001F). This is HL7v2 with no exception, and it settles the carriage return the same way as the line feed.
- **The specification carries the other sequences; it does not interpret them.** `\X…\` and `\Z…\` mean what sender and receiver agree (§2.7.6, §2.7.8), and a formatting command is an instruction for display. The message holds each as written.

## Statements from Chapter 2

What the specification formalizes, statement by statement, from HL7 Version 2.8.1, Chapter 2. Each statement has a name, and each Lean definition cites the name of the statement it formalizes. A row marked **no** is a statement the specification does not formalize yet.

| Statement name                          | Statement                                                                                                       | §               | Formalized by                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| `message_structure`                     | A message is segments; a segment is fields; a field holds repetitions, components, then subcomponents           | 2.5             | `Message`, `Segment`, `Field`                                  |
| `components_do_not_repeat`              | Components and subcomponents do not repeat                                                                      | 2.5.3.6         | `Component`, `Subcomponent`: no repetition level below a field |
| `segment_terminator_is_carriage_return` | The segment terminator is always a carriage return                                                              | 2.5.4           | `segmentTerminator`, `encode`                                  |
| `field_separator_after_segment_id`      | The field separator also separates the segment ID from the first field                                          | 2.5.4           | `encodeFields`, `encodeSegment`                                |
| `segment_id_is_three_characters`        | A segment ID is three characters                                                                                | 2.5.2           | `well_formed_segment_id_length`                                |
| `delimiters_declared_in_msh`            | MSH declares the delimiters: the field separator is its 4th character, the encoding characters are MSH-2        | 2.5.4, 2.14.9.2 | `Delimiters`, `encodeHeader`                                   |
| `receiver_uses_declared_delimiters`     | A receiver parses a message with the delimiters its MSH declares                                                | 2.5.4           | partly: `decode`, a proof device, not a statement              |
| `truncation_character`                  | The truncation character is the 5th encoding character                                                          | 2.5.4           | **no**                                                         |
| `delimiters_escaped_in_data`            | A delimiter in data SHALL be escaped: `\F\`, `\S\`, `\T\`, `\R\`, `\E\`, and `\P\` for the truncation character | 2.7.1, 2.6.1    | `escapeChar`, except `\P\`, which is held as a sequence        |
| `escape_sequence_form`                  | An escape sequence is the escape character, an escape code ID, data characters, and the escape character        | 2.7.1           | `Piece`, `escapePiece`                                         |
| `no_nested_escape_sequences`            | Escape sequences SHALL NOT contain nested escape sequences                                                      | 2.7.1           | `well_formed_escape_sequence_no_delimiter`                     |
| `escape_sequences_by_data_type`         | `\H\`, `\N\`, `\X…\`, `\Z…\` are for TX, FT and CF; formatting commands for FT                                  | 2.7.1, 2.7.7    | **no**: the message has no data types                          |
| `hex_and_local_by_agreement`            | The meaning of `\X…\` and `\Z…\` is left to an agreement between sender and receiver                            | 2.7.6, 2.7.8    | `isDefinedSequence`: carried as written                        |
| `defined_escape_sequences`              | The sequences §2.7 defines: truncation, character sets, highlighting, hexadecimal data, formatted text, local   | 2.7.2–2.7.8     | `isDefinedSequence`, `well_formed_escape_sequence_defined`     |
| `ignore_unexpected`                     | A receiver ignores segments, fields, components, subcomponents and repetitions it did not expect                | 2.6.2           | **no**: needs a message profile                                |
| `missing_segment_not_present`           | An expected optional segment that is missing consists of fields that are not present                            | 2.6.2           | **no**: needs a message profile                                |
| `missing_field_not_present`             | An expected field or component that is missing is not present                                                   | 2.6.2           | partly: `Field.isPresent`, `trimFields`                        |
| `population_states`                     | A field is populated, not populated, or null                                                                    | 2.5.3.0         | **no**                                                         |
| `null_means_delete`                     | Null is written `""` and means: delete the receiver's value                                                     | 2.5.3.0         | **no**                                                         |
| `empty_is_not_populated`                | An empty item is not populated, never present with length 0                                                     | 2.5.5.0         | **no**                                                         |

Outside the statements above: the rules for where `\.in\` and `\.ti\` may stand in a line (§2.7.7), batches (§2.10), character sets, and message structure (segment order and groups).

## Learning and reviewing

[GUIDE.md](GUIDE.md) is a path for learning enough Lean to read this specification, and a checklist for reviewing a change to it.

[docs/](docs/README.md) holds lessons that read the specification file by file, from the first definitions to the proofs and to checking glion against the oracle.

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

# HL7v2 statements and their formalization

This document has two parts. Part I lists what HL7 Version 2.8.1, Chapter 2 (Control) says about a message and its text. Part II is the formalization built on it: the questions the specification answers, the properties it proves, the rules it states, and where the standard leaves a gap.

Part I holds nothing of ours except the wording of each statement. Part II holds every choice the specification makes. A reader who disagrees with the specification should be able to say which: a statement in Part I that misreads the standard, or a choice in Part II.

# Part I: What Chapter 2 says

Each row is one statement. It has a name, the statement in plain words, its kind, and the sentence of the standard it comes from. The quoted sentence is the source; the name is a handle and the plain wording is our reading of it.

| Kind           | Means                                                              |
| -------------- | ------------------------------------------------------------------ |
| Definition     | What a thing is, or what it is made of                             |
| Construction   | What a sender writes, from the pseudocode of §2.6.1.0              |
| Requirement    | What must hold. "SHALL" marks the ones the standard states with it |
| Receiver rule  | What a receiver does with a text                                   |
| Recommendation | What the standard suggests and does not require                    |

## What a message is (§2.5.1 to §2.5.3)

| Name                             | Statement                                                               | Kind                | Source                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_is_segments`            | A message is a sequence of segments                                     | Definition          | "A message is the atomic unit of data transferred between systems. It is comprised of a group of segments in a defined sequence." (§2.5.1)                                                                                |
| `segment_is_fields`              | A segment is a group of fields                                          | Definition          | "A segment is a logical grouping of data fields." (§2.5.2)                                                                                                                                                                |
| `segment_id_is_three_characters` | A segment is identified by a Segment ID of three characters             | Requirement         | "Each segment is identified by a unique three-character code known as the Segment ID." (§2.5.2)                                                                                                                           |
| `field_is_characters`            | The data of a field is characters                                       | Definition          | "A field is a string of characters." (§2.5.3) "When fields are transmitted, they are sent as character strings" (§2.5.3.0)                                                                                                |
| `field_holds_components`         | A field is made of components                                           | Definition          | "Composite data types are made up of a series of components that are themselves assigned to a data type, which may again be either primitive or composite data types." (§2.5.3.4)                                         |
| `component_holds_subcomponents`  | A component is made of subcomponents, and a subcomponent is not divided | Requirement (SHALL) | "In the case of composite data types, the components of a component are called sub-components, and they SHALL only be assigned primitive data types." (§2.5.3.4)                                                          |
| `field_may_repeat`               | A field has one or more occurrences                                     | Definition          | "Whether the field may repeat. The value that appears in the repetitions column is the maximum number of allowed occurrences" (§2.5.3.6)                                                                                  |
| `components_do_not_repeat`       | A component and a subcomponent have one occurrence                      | Requirement         | "Note that components and subcomponents may not repeat" (§2.5.3.6)                                                                                                                                                        |
| `population_states`              | A field is populated, not populated, or null                            | Requirement (SHALL) | "A field SHALL exist in one of three population states in an HL7 message" (§2.5.3.0)                                                                                                                                      |
| `null_is_two_double_quotes`      | Null is written as two double quotes, and they mean nothing else        | Requirement         | "This is symbolically communicated as two double-quotes between the delimiters (i.e., \|""\|). Employing consecutive double quote characters as the only content of a field for other purposes is prohibited." (§2.5.3.0) |
| `empty_is_not_populated`         | An item with no content is not populated; it is not a value of length 0 | Requirement         | "If an item is optional, and there is no content present, the item is considered as not populated, rather than present with a length of 0." (§2.5.5.0)                                                                    |

## The delimiters (§2.5.4, §2.14.9)

| Name                                    | Statement                                                                                            | Kind           | Source                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_delimiters`                    | A message uses seven special characters                                                              | Definition     | "They are the segment terminator, the field separator, the component separator, subcomponent separator, repetition separator, escape character and truncation character." (§2.5.4)                                                                    |
| `segment_terminator_is_carriage_return` | The segment terminator is a carriage return, and a message cannot choose another                     | Requirement    | "The segment terminator is always a carriage return (in ASCII, a hex 0D)." "This value cannot be changed by implementers." (§2.5.4)                                                                                                                   |
| `delimiters_declared_in_msh`            | The message declares its other delimiters at the start of MSH                                        | Requirement    | "The other delimiters are defined in the MSH segment, with the field delimiter in the 4th character position, and the other delimiters occurring as in the field called Encoding Characters, which is the first field after the segment ID." (§2.5.4) |
| `encoding_characters_order`             | MSH-2 holds the component, repetition, escape, subcomponent and truncation characters, in that order | Requirement    | "This field contains five characters in the following order: the component separator, repetition separator, escape character, subcomponent separator, and truncation character." (§2.14.9.2)                                                          |
| `delimiters_hold_for_whole_message`     | The delimiters MSH declares are the delimiters of the whole message                                  | Requirement    | "The delimiter values used in the MSH segment are the delimiter values used throughout the entire message." (§2.5.4)                                                                                                                                  |
| `suggested_delimiters`                  | The suggested delimiters are `\|`, `^`, `~`, `\`, `&`, `#`                                           | Recommendation | "In the absence of other considerations, HL7 recommends the suggested values found in Figure 2-1" (§2.5.4)                                                                                                                                            |
| `field_separator_after_segment_id`      | The field separator also separates the Segment ID from the first field                               | Requirement    | The field separator "also separates the segment ID from the first data field in each segment." (§2.5.4, Figure 2-1)                                                                                                                                   |
| `truncation_character`                  | The truncation character marks a value that was cut short                                            | Definition     | "Indicated character to be used for the truncation pattern" (§2.5.4, Figure 2-1)                                                                                                                                                                      |
| `escape_character_use`                  | The escape character is for ST, TX and FT data                                                       | Definition     | "Escape character for use with any field, component, or sub-component represented by an ST, TX or FT data type." (§2.5.4, Figure 2-1)                                                                                                                 |

## How a sender writes a message (§2.6.1)

The standard gives the construction as pseudocode. Each row quotes its lines.

| Name                                | Statement                                                              | Kind                | Source                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `segment_starts_with_its_id`        | A segment is written starting with its Segment ID                      | Construction        | `foreach segment in ( segment_list ) { insert segment.name; /* e.g., MSH */` (§2.6.1.0)                                                                                                          |
| `field_separator_before_each_field` | The field separator is written before each field                       | Construction        | `foreach field in ( fields_of( segment ) ) { insert field separator; /* e.g., \| */` (§2.6.1.0)                                                                                                  |
| `repetitions_joined`                | The repetition separator is written between the occurrences of a field | Construction        | `if not last ( populated occurrence ) insert repetition_separator; /* e.g., ~ */` (§2.6.1.0)                                                                                                     |
| `components_joined`                 | The component separator is written between components                  | Construction        | `if not last ( populated component ) insert component_separator; /* e.g., ^ */` (§2.6.1.0)                                                                                                       |
| `subcomponents_joined`              | The subcomponent separator is written between subcomponents            | Construction        | `if not last ( populated subcomponent ) insert subcomponent_separator; /* e.g., & */` (§2.6.1.0)                                                                                                 |
| `segment_terminator_after_segment`  | The segment terminator is written after each segment                   | Construction        | `insert segment_terminator; /* always<cr>! */` (§2.6.1.0)                                                                                                                                        |
| `trailing_not_populated_omitted`    | Nothing is written after the last populated item of a level            | Construction        | `break if last ( populated field );` and `if not last ( populated … )` at each level (§2.6.1.0)                                                                                                  |
| `delimiters_escaped_in_data`        | A delimiter in data is written as an escape sequence                   | Requirement (SHALL) | `substitute( field_separator, \F\ );` and the lines for `\S\`, `\R\`, `\E\`, `\T\`, `\P\` (§2.6.1.0). "When delimiters are included in any component, the delimiters SHALL be escaped." (§2.7.1) |

## What a receiver does (§2.5.4, §2.6.2)

| Name                                | Statement                                                                | Kind          | Source                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receiver_uses_declared_delimiters` | A receiver reads a message with the delimiters its MSH declares          | Receiver rule | "the receiving applications will use the agreed upon delimiters, as they appear in the Message Header segment (MSH), to parse the message." (§2.5.4) |
| `ignore_unexpected`                 | A receiver ignores what it did not expect                                | Receiver rule | "ignore segments, fields, components, subcomponents, and extra repetitions of a field that are present but were not expected." (§2.6.2)              |
| `missing_segment_not_present`       | A missing optional segment is a segment whose fields are all not present | Receiver rule | "treat optional segments that were expected but are not present as consisting entirely of fields that are not present." (§2.6.2)                     |
| `missing_field_not_present`         | A missing field or component is not present                              | Receiver rule | "treat fields and components that are expected but were not included in a segment as not present." (§2.6.2)                                          |

## Escape sequences (§2.7)

| Name                             | Statement                                                                                     | Kind                | Source                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escape_character_declared`      | The escape character is the one MSH-2 declares                                                | Definition          | "The escape character is whichever ASCII character is specified in the <escape character> component of MSH-2 Encoding Characters." (§2.7.1)                                                                                                         |
| `escape_sequence_form`           | An escape sequence is the escape character, a code, data characters, and the escape character | Definition          | "An escape sequence consists of the escape character followed by an escape code ID of one character, zero (0) or more data characters, and another occurrence of the escape character." (§2.7.1)                                                    |
| `delimiter_escape_sequences`     | Six sequences stand for the delimiters                                                        | Definition          | `\F\` field separator, `\S\` component separator, `\T\` subcomponent separator, `\R\` repetition separator, `\E\` escape character, `\P\` truncation character (§2.7.1)                                                                             |
| `special_characters_in_data`     | With those sequences, data can hold the delimiter characters                                  | Definition          | "The special character escape sequences (\F\, \S\, \R\, \T\, \P\ and \E\) allow the corresponding characters to be included in the data in a text field, though the actual characters are reserved." (§2.7.5)                                       |
| `no_nested_escape_sequences`     | An escape sequence holds no escape sequence                                                   | Requirement (SHALL) | "Escape sequences SHALL NOT contain nested escape sequences." (§2.7.1)                                                                                                                                                                              |
| `text_escape_sequences`          | TX, FT and CF data may hold four more sequences                                               | Definition          | "When a field, component or sub-component of type TX, FT, or CF is being encoded, additional escape character(s) may be used": `\H\`, `\N\`, `\Xdddd...\`, `\Zdddd...\` (§2.7.1)                                                                    |
| `truncation_character_escaped`   | A truncation character that ends a value is written as its sequence                           | Requirement (SHALL) | "When the last character of a value that is expected to be truncated is the truncation character, the truncation character SHALL be escaped." (§2.7.2)                                                                                              |
| `character_set_escape_sequences` | Two sequences switch the character set                                                        | Definition          | `\Cxxyy\` "single-byte character set escape sequence with two hexadecimal values", `\Mxxyyzz\` "multi-byte character set escape sequence with three hexadecimal values, xx, yy and zz. zz is optional." (§2.7.3)                                    |
| `hexadecimal_form`               | `\X…\` holds one or more pairs of hexadecimal digits                                          | Requirement (SHALL) | "the X SHALL be followed by 1 or more pairs of hexadecimal digits (0, 1, . . . , 9, A, . . . , F)." (§2.7.6)                                                                                                                                        |
| `hexadecimal_by_agreement`       | What `\X…\` means is agreed between sender and receiver                                       | Definition          | "Consecutive pairs of the hexadecimal digits represent 8-bit binary values. The interpretation of the data is entirely left to an agreement between the sending and receiving applications that is beyond the scope of this Standard." (§2.7.6)     |
| `formatting_commands`            | FT data may hold formatting commands, each between two escape characters                      | Requirement (SHALL) | "If the field is of the formatted text (FT) data type, formatting commands also SHALL be surrounded by the escape character. Each command begins with the "." (period) character.": `.sp`, `.br`, `.fi`, `.nf`, `.in`, `.ti`, `.sk`, `.ce` (§2.7.7) |
| `local_by_agreement`             | What `\Z…\` means is agreed between sender and receiver                                       | Definition          | "the Z SHALL be followed by characters that are valid in a TX field. The interpretation of the data is entirely left to an agreement between the sending and receiving applications" (§2.7.8)                                                       |
| `escape_sequence_length`         | The characters between the two escape characters count towards length                         | Requirement         | "For the purposes of determining length, all the characters inside the escape (all between the opening and closing \, not including the \ symbols themselves) count towards the length." (§2.7.1)                                                   |

## Data in a value (Chapter 2A)

| Name                      | Statement                                                                      | Kind        | Source                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string_data_displayable` | String data is displayable characters, without delimiters or escape characters | Requirement | "Any displayable (printable) ACSII characters (hexadecimal values between 20 and 7E, inclusive, or ASCII decimal values between 32 and 126), except the defined escape characters and defined delimiter characters." (2A, ST) |

## Outside Part I

Chapter 2 also covers message types and trigger events (§2.5.1), segment groups and the order of segments (§2.5.2), lengths and truncation (§2.5.5), acknowledgments (§2.9), batches (§2.10), local extensions (§2.11) and character sets (§2.14.9.18). They are not about how one message is written as text, and no row covers them yet.

# Part II: The formalization

## The questions

A formalization of the statements above has to answer four questions. Each later section belongs to one of them.

| Question                           | Answered by                       | Statements it draws on                                                                                  |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. What is a message?              | Types                             | "What a message is", "The delimiters"                                                                   |
| 2. What is its text?               | A function from a message to text | "How a sender writes a message", "Escape sequences"                                                     |
| 3. When are two messages the same? | A notion of equality              | `population_states`, `empty_is_not_populated`, `trailing_not_populated_omitted`, "What a receiver does" |
| 4. What must hold between the two? | Properties, proved as theorems    | The properties below                                                                                    |

Question 3 is the one the standard answers least directly. Until a lesson takes it up, two messages are the same when they are equal as values: the same delimiters, the same segments, level by level.

## How a statement becomes Lean

| Kind           | Becomes                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Definition     | A type or a definition                                                                                                              |
| Construction   | A function, or a part of one                                                                                                        |
| Requirement    | A rule of `Message.WF` when some messages break it; a theorem when it holds of every message; a type when the structure enforces it |
| Receiver rule  | A theorem about what the text determines. The specification defines no receiver                                                     |
| Recommendation | A named value                                                                                                                       |

## Properties

A property is a claim about every message, or every well-formed message. The standard states some as requirements and relies on others without stating them. The specification proves each as a theorem. Each is stated as an explicit claim: what must be true of the text, not how a sender or a receiver gets there.

| Property                     | The claim                                                                                                                                                                                                    | From                                                              | Lean                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `one_text_one_meaning`       | For all messages `m₁` and `m₂`: if the text of `m₁` is the text of `m₂`, then `m₁` is `m₂`                                                                                                                   | Implicit. See below                                               | `encode_injective`, for well-formed messages                                        |
| `text_declares_delimiters`   | For every message `m`: the 4th character of its text is its field separator, and the four characters after it are its component separator, repetition separator, escape character and subcomponent separator | `delimiters_declared_in_msh`, `receiver_uses_declared_delimiters` | `field_separator_is_fourth_character`, `encoding_characters_follow_field_separator` |
| `data_may_hold_delimiters`   | For every value `v`, whatever characters it holds: the text written for `v` holds no separator, and if `v` and `w` are written as the same text, then `v` is `w`                                             | `special_characters_in_data`, `delimiters_escaped_in_data`        | Not yet                                                                             |
| `omission_keeps_the_message` | For all messages `m₁` and `m₂` that differ only in trailing items that are not populated: `m₁` and `m₂` are the same message                                                                                 | `trailing_not_populated_omitted`, `missing_field_not_present`     | Not yet                                                                             |

**A property is not a procedure.** The pseudocode of §2.6.1.0 gives the escaping of delimiters as a list of substitutions. The specification does not formalize the steps or their order. It states `data_may_hold_delimiters`: what the written value must satisfy. A way of writing a value is correct when the claim holds of it, and a reading of the pseudocode under which the claim fails is not what the standard means.

**`one_text_one_meaning` is not a sentence of the standard.** The standard relies on it in at least three places:

- "Both the sender and receiver of the data must have predictable rules for how they will process the data." (§2.6)
- "When delimiters are included in any component, the delimiters SHALL be escaped. Failure to do so may alter the meaning of the component." (§2.7.1)
- "…so that no ambiguity can exist as to the individual or group location of any occurrence of segment X in a message instance." (§2.5.2)

A receiver has only the text. If one text could come from two messages, the receiver could not know which one the sender meant, and no rule for the receiver could repair that.

## Rules

The rules of `Message.WF`, each with its source: a requirement of Part I, or a property whose proof needs it.

| Rule                         | Says                                                                    | Source                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `separators_distinct`        | The segment terminator and the four separators are different characters | `one_text_one_meaning`                                                 |
| `escape_not_terminator`      | The escape character is not the segment terminator                      | `one_text_one_meaning`                                                 |
| `segment_id_length`          | A Segment ID has three characters                                       | `segment_id_is_three_characters`; `one_text_one_meaning` also needs it |
| `segment_id_no_terminator`   | A Segment ID does not hold the segment terminator                       | `one_text_one_meaning`                                                 |
| `field_has_repetition`       | A field holds at least one repetition                                   | `one_text_one_meaning`                                                 |
| `repetition_has_component`   | A repetition holds at least one component                               | `one_text_one_meaning`                                                 |
| `component_has_subcomponent` | A component holds at least one subcomponent                             | `one_text_one_meaning`                                                 |
| `subcomponent_no_separator`  | A subcomponent holds no separator and no segment terminator             | `one_text_one_meaning`                                                 |

A rule whose source is a property is one the proof of that property uses. The proof shows the rules are enough. It does not show each is needed: a rule shown to be needed is recorded with its counterexample under "Gaps and decisions".

## Gaps and decisions

Where the standard is silent, or says two things that pull apart, the specification has to choose. Each entry is a question. It is **open** until a lesson decides it, and a decision is recorded below the table with its reason. A decision is a claim about messages, with what goes wrong without it. How a sender or a receiver is built is never one.

| Question                                                 | What the standard says                                                                                                                                      | Status          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| May two delimiters be the same character?                | Nothing. Figure 2-1 suggests six different characters.                                                                                                      | Decided         |
| Which characters may a value hold?                       | `string_data_displayable` excludes delimiter and escape characters from string data. `special_characters_in_data` says sequences let data hold them.        | Decided for now |
| What is an empty field: no repetition, or one empty one? | `empty_is_not_populated` says an item with no content is not populated. It does not say how many repetitions, components or subcomponents such a field has. | Decided         |
| When is an item "populated"?                             | The pseudocode uses the word at every level and does not define it for a repetition, a component or a subcomponent.                                         | Open            |
| Is `\|a` the same message as `\|a\|\|`?                  | `trailing_not_populated_omitted` has a sender write the first. `missing_field_not_present` has a receiver treat a missing field as not present.             | Open            |
| Is the truncation character part of MSH-2?               | `encoding_characters_order` lists five characters. Figure 2-1 suggests `^~\&` and gives the truncation character position 5.                                | Open            |

**Decided: the segment terminator and the four separators are different characters** (`separators_distinct`). With `^` as both the component and the subcomponent separator, `MSH|^~\^␍PID|a^b␍` is the text of a field of two components and of a field of one component with two subcomponents. So `one_text_one_meaning` fails without the rule. The escape character is asked only not to be the segment terminator (`escape_not_terminator`): this writer writes it nowhere but MSH-2.

**Decided: an empty field is one repetition of one component of one empty subcomponent** (`field_has_repetition`, `repetition_has_component`, `component_has_subcomponent`). A component with no subcomponent and a component with one empty subcomponent are both written as nothing, so `MSH|^~\&␍PID|␍` would be the text of two messages. No level of a field is an empty list.

**Decided for now: a value holds no separator and no segment terminator** (`subcomponent_no_separator`). The writer writes each value as it is, so `MSH|^~\&␍PID|&␍` is the text of a subcomponent `&` and of two empty subcomponents. The rule excludes such values. It agrees with `string_data_displayable` and not with `special_characters_in_data`; the question is taken up again when the writer formalizes `delimiters_escaped_in_data`.

## Where each statement is formalized

The Lean definition, rule or theorem that formalizes each statement of Part I. **Not yet** marks a statement no lesson has reached. A lesson that formalizes a statement fills in its row.

| Statement                               | Lean                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `message_is_segments`                   | `Message`                                                               |
| `segment_is_fields`                     | `Segment`                                                               |
| `segment_id_is_three_characters`        | rule `segment_id_length`                                                |
| `field_is_characters`                   | `Subcomponent`                                                          |
| `field_holds_components`                | `Repetition`                                                            |
| `component_holds_subcomponents`         | `Component`                                                             |
| `field_may_repeat`                      | `Field`                                                                 |
| `components_do_not_repeat`              | `Field`: no level below it repeats                                      |
| `population_states`                     | Not yet                                                                 |
| `null_is_two_double_quotes`             | Not yet                                                                 |
| `empty_is_not_populated`                | Not yet                                                                 |
| `message_delimiters`                    | `Delimiters`, `Delimiters.separators`, without the truncation character |
| `segment_terminator_is_carriage_return` | `segmentTerminator`                                                     |
| `delimiters_declared_in_msh`            | `encodeHeader`; property `text_declares_delimiters`                     |
| `encoding_characters_order`             | `Delimiters.encodingCharacters`, without the truncation character       |
| `delimiters_hold_for_whole_message`     | `Message.delimiters`: one value per message                             |
| `suggested_delimiters`                  | `Delimiters.suggested`, without the truncation character                |
| `field_separator_after_segment_id`      | `encodeFields`                                                          |
| `truncation_character`                  | Not yet                                                                 |
| `escape_character_use`                  | Not yet                                                                 |
| `segment_starts_with_its_id`            | `encodeSegment`; theorem `encode_starts_with_msh`                       |
| `field_separator_before_each_field`     | `encodeFields`                                                          |
| `repetitions_joined`                    | `encodeField`                                                           |
| `components_joined`                     | `encodeRepetition`                                                      |
| `subcomponents_joined`                  | `encodeComponent`                                                       |
| `segment_terminator_after_segment`      | `encode`                                                                |
| `trailing_not_populated_omitted`        | Not yet                                                                 |
| `delimiters_escaped_in_data`            | Not yet                                                                 |
| `receiver_uses_declared_delimiters`     | Not yet                                                                 |
| `ignore_unexpected`                     | Not yet                                                                 |
| `missing_segment_not_present`           | Not yet                                                                 |
| `missing_field_not_present`             | Not yet                                                                 |
| `escape_character_declared`             | Not yet                                                                 |
| `escape_sequence_form`                  | Not yet                                                                 |
| `delimiter_escape_sequences`            | Not yet                                                                 |
| `special_characters_in_data`            | Not yet                                                                 |
| `no_nested_escape_sequences`            | Not yet                                                                 |
| `text_escape_sequences`                 | Not yet                                                                 |
| `truncation_character_escaped`          | Not yet                                                                 |
| `character_set_escape_sequences`        | Not yet                                                                 |
| `hexadecimal_form`                      | Not yet                                                                 |
| `hexadecimal_by_agreement`              | Not yet                                                                 |
| `formatting_commands`                   | Not yet                                                                 |
| `local_by_agreement`                    | Not yet                                                                 |
| `escape_sequence_length`                | Not yet                                                                 |
| `string_data_displayable`               | Not yet                                                                 |

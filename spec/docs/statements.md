# The statements of Chapter 2

What HL7 Version 2.8.1, Chapter 2 (Control) says about a message and its text, one statement per row. Each statement has a name, the sentence of the standard it comes from, and its section. The specification formalizes these statements and nothing else.

The last column names the Lean definition or theorem that formalizes the statement. **Not yet** marks a statement no lesson has reached. A lesson that formalizes a statement fills in its row.

Read a row against the standard before trusting it: the quoted sentence is the source, and the name is only a handle.

## One text, one meaning

This statement is not a sentence of the standard. The standard assumes it everywhere.

| Name                   | The standard says                                                                                               | §     | Lean                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `one_text_one_meaning` | Implicit: two different messages are never written as the same text. Three sentences of the standard rely on it | below | theorem `encode_injective`, for well-formed messages |

- "Both the sender and receiver of the data must have predictable rules for how they will process the data." (§2.6)
- "When delimiters are included in any component, the delimiters SHALL be escaped. Failure to do so may alter the meaning of the component." (§2.7.1)
- "…so that no ambiguity can exist as to the individual or group location of any occurrence of segment X in a message instance." (§2.5.2)

A receiver has only the text. If one text could come from two messages, the receiver could not know which one the sender meant, and no rule for the receiver could repair that.

## What a message is (§2.5.1 to §2.5.3)

| Name                             | The standard says                                                                                                                                                                                              | §       | Lean                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------- |
| `message_is_segments`            | "A message is the atomic unit of data transferred between systems. It is comprised of a group of segments in a defined sequence."                                                                              | 2.5.1   | `Message`                           |
| `segment_is_fields`              | "A segment is a logical grouping of data fields."                                                                                                                                                              | 2.5.2   | `Segment`                           |
| `segment_id_is_three_characters` | "Each segment is identified by a unique three-character code known as the Segment ID."                                                                                                                         | 2.5.2   | rule `Message.WF.segment_id_length` |
| `field_is_characters`            | "A field is a string of characters." "When fields are transmitted, they are sent as character strings"                                                                                                         | 2.5.3   | `Subcomponent`                      |
| `field_holds_components`         | "Composite data types are made up of a series of components that are themselves assigned to a data type, which may again be either primitive or composite data types."                                         | 2.5.3.4 | `Repetition`                        |
| `component_holds_subcomponents`  | "In the case of composite data types, the components of a component are called sub-components, and they SHALL only be assigned primitive data types."                                                          | 2.5.3.4 | `Component`                         |
| `field_may_repeat`               | "Whether the field may repeat."                                                                                                                                                                                | 2.5.3.6 | `Field`                             |
| `components_do_not_repeat`       | "Note that components and subcomponents may not repeat"                                                                                                                                                        | 2.5.3.6 | `Field`: no level below it repeats  |
| `population_states`              | "A field SHALL exist in one of three population states in an HL7 message": populated, not populated, null                                                                                                      | 2.5.3.0 | Not yet                             |
| `null_is_two_double_quotes`      | "This is symbolically communicated as two double-quotes between the delimiters (i.e., \|""\|). Employing consecutive double quote characters as the only content of a field for other purposes is prohibited." | 2.5.3.0 | Not yet                             |
| `empty_is_not_populated`         | "If an item is optional, and there is no content present, the item is considered as not populated, rather than present with a length of 0."                                                                    | 2.5.5.0 | Not yet                             |

## The delimiters (§2.5.4, §2.14.9)

| Name                                    | The standard says                                                                                                                                                                                                                            | §        | Lean                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `message_delimiters`                    | "They are the segment terminator, the field separator, the component separator, subcomponent separator, repetition separator, escape character and truncation character."                                                                    | 2.5.4    | `Delimiters`, `Delimiters.separators`, without the truncation character                                      |
| `segment_terminator_is_carriage_return` | "The segment terminator is always a carriage return (in ASCII, a hex 0D)." "This value cannot be changed by implementers."                                                                                                                   | 2.5.4    | `segmentTerminator`                                                                                          |
| `delimiters_declared_in_msh`            | "The other delimiters are defined in the MSH segment, with the field delimiter in the 4th character position, and the other delimiters occurring as in the field called Encoding Characters, which is the first field after the segment ID." | 2.5.4    | `encodeHeader`; theorems `field_separator_is_fourth_character`, `encoding_characters_follow_field_separator` |
| `encoding_characters_order`             | "This field contains five characters in the following order: the component separator, repetition separator, escape character, subcomponent separator, and truncation character."                                                             | 2.14.9.2 | `Delimiters.encodingCharacters`, without the truncation character                                            |
| `delimiters_hold_for_whole_message`     | "The delimiter values used in the MSH segment are the delimiter values used throughout the entire message."                                                                                                                                  | 2.5.4    | `Message.delimiters`: one value per message                                                                  |
| `suggested_delimiters`                  | "In the absence of other considerations, HL7 recommends the suggested values found in Figure 2-1": `\|`, `^`, `~`, `\`, `&`, `#`                                                                                                             | 2.5.4    | `Delimiters.suggested`, without the truncation character                                                     |
| `field_separator_after_segment_id`      | The field separator "also separates the segment ID from the first data field in each segment."                                                                                                                                               | 2.5.4    | `encodeFields`                                                                                               |
| `receiver_uses_declared_delimiters`     | "the receiving applications will use the agreed upon delimiters, as they appear in the Message Header segment (MSH), to parse the message."                                                                                                  | 2.5.4    | Not yet                                                                                                      |
| `truncation_character`                  | "Indicated character to be used for the truncation pattern"                                                                                                                                                                                  | 2.5.4    | Not yet                                                                                                      |

## How a sender writes a message (§2.6.1)

The standard gives the construction as pseudocode. Each row quotes its lines.

| Name                                | The standard says                                                                                                                                                                   | §              | Lean                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------- |
| `segment_starts_with_its_id`        | `foreach segment in ( segment_list ) { insert segment.name; /* e.g., MSH */`                                                                                                        | 2.6.1.0        | `encodeSegment`; theorem `encode_starts_with_msh` |
| `field_separator_before_each_field` | `foreach field in ( fields_of( segment ) ) { insert field separator; /* e.g., \| */`                                                                                                | 2.6.1.0        | `encodeFields`                                    |
| `repetitions_joined`                | `if not last ( populated occurrence ) insert repetition_separator; /* e.g., ~ */`                                                                                                   | 2.6.1.0        | `encodeField`                                     |
| `components_joined`                 | `if not last ( populated component ) insert component_separator; /* e.g., ^ */`                                                                                                     | 2.6.1.0        | `encodeRepetition`                                |
| `subcomponents_joined`              | `if not last ( populated subcomponent ) insert subcomponent_separator; /* e.g., & */`                                                                                               | 2.6.1.0        | `encodeComponent`                                 |
| `segment_terminator_after_segment`  | `insert segment_terminator; /* always<cr>! */`                                                                                                                                      | 2.6.1.0        | `encode`                                          |
| `trailing_not_populated_omitted`    | `break if last ( populated field );` and "if not last ( populated … )" at each level: a sender writes nothing after the last populated field, repetition, component or subcomponent | 2.6.1.0        | Not yet                                           |
| `delimiters_escaped_in_data`        | `substitute( field_separator, \F\ );` and the lines for `\S\`, `\R\`, `\E\`, `\T\`, `\P\`. "When delimiters are included in any component, the delimiters SHALL be escaped."        | 2.6.1.0, 2.7.1 | Not yet                                           |

## What a receiver does (§2.6.2)

| Name                          | The standard says                                                                                                              | §     | Lean    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- | ------- |
| `ignore_unexpected`           | "ignore segments, fields, components, subcomponents, and extra repetitions of a field that are present but were not expected." | 2.6.2 | Not yet |
| `missing_segment_not_present` | "treat optional segments that were expected but are not present as consisting entirely of fields that are not present."        | 2.6.2 | Not yet |
| `missing_field_not_present`   | "treat fields and components that are expected but were not included in a segment as not present."                             | 2.6.2 | Not yet |

## Escape sequences (§2.7)

| Name                             | The standard says                                                                                                                                                                                                                          | §            | Lean    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------- |
| `escape_character_declared`      | "The escape character is whichever ASCII character is specified in the <escape character> component of MSH-2 Encoding Characters."                                                                                                         | 2.7.1        | Not yet |
| `escape_sequence_form`           | "An escape sequence consists of the escape character followed by an escape code ID of one character, zero (0) or more data characters, and another occurrence of the escape character."                                                    | 2.7.1        | Not yet |
| `delimiter_escape_sequences`     | `\F\` field separator, `\S\` component separator, `\T\` subcomponent separator, `\R\` repetition separator, `\E\` escape character, `\P\` truncation character                                                                             | 2.7.1, 2.7.5 | Not yet |
| `no_nested_escape_sequences`     | "Escape sequences SHALL NOT contain nested escape sequences."                                                                                                                                                                              | 2.7.1        | Not yet |
| `text_escape_sequences`          | "When a field, component or sub-component of type TX, FT, or CF is being encoded, additional escape character(s) may be used": `\H\`, `\N\`, `\Xdddd...\`, `\Zdddd...\`                                                                    | 2.7.1        | Not yet |
| `truncation_character_escaped`   | "When the last character of a value that is expected to be truncated is the truncation character, the truncation character SHALL be escaped."                                                                                              | 2.7.2        | Not yet |
| `character_set_escape_sequences` | `\Cxxyy\` "single-byte character set escape sequence with two hexadecimal values", `\Mxxyyzz\` "multi-byte character set escape sequence with three hexadecimal values, xx, yy and zz. zz is optional."                                    | 2.7.3        | Not yet |
| `hexadecimal_form`               | "the X SHALL be followed by 1 or more pairs of hexadecimal digits (0, 1, . . . , 9, A, . . . , F)."                                                                                                                                        | 2.7.6        | Not yet |
| `hexadecimal_by_agreement`       | "Consecutive pairs of the hexadecimal digits represent 8-bit binary values. The interpretation of the data is entirely left to an agreement between the sending and receiving applications that is beyond the scope of this Standard."     | 2.7.6        | Not yet |
| `formatting_commands`            | "If the field is of the formatted text (FT) data type, formatting commands also SHALL be surrounded by the escape character. Each command begins with the "." (period) character.": `.sp`, `.br`, `.fi`, `.nf`, `.in`, `.ti`, `.sk`, `.ce` | 2.7.7        | Not yet |
| `local_by_agreement`             | "the Z SHALL be followed by characters that are valid in a TX field. The interpretation of the data is entirely left to an agreement between the sending and receiving applications"                                                       | 2.7.8        | Not yet |
| `escape_sequence_length`         | "For the purposes of determining length, all the characters inside the escape (all between the opening and closing \, not including the \ symbols themselves) count towards the length."                                                   | 2.7.1        | Not yet |

## Data in a value (Chapter 2A)

| Name                      | The standard says                                                                                                                                                                                                    | §      | Lean    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| `string_data_displayable` | "Any displayable (printable) ACSII characters (hexadecimal values between 20 and 7E, inclusive, or ASCII decimal values between 32 and 126), except the defined escape characters and defined delimiter characters." | 2A, ST | Not yet |
| `escape_character_use`    | The escape character is "for use with any field, component, or sub-component represented by an ST, TX or FT data type."                                                                                              | 2.5.4  | Not yet |

## Decisions

The standard's text leaves some things open. A decision is recorded here when the specification has to choose, with the reason. A lesson that makes a decision adds it.

- **Delimiters are substituted one character at a time.** The pseudocode of §2.6.1.0 substitutes in order: the field separator, the component separator, the repetition separator, then the escape character. Applied one after another to the whole value, the fourth line would substitute the escape characters the first three lines wrote: `|` would become `\F\` and then `\E\F\E\`. §2.7.5 shows `\F\` standing for `|`, so the specification reads the lines as one substitution per character of data.

- **The rules `one_text_one_meaning` needs.** The standard does not state the claim, so it does not state what the claim needs. The proof of `encode_injective` uses eight rules, and seven of them are not sentences of Chapter 2: the segment terminator and the four separators are different characters (`separators_distinct`); the escape character is not the segment terminator (`escape_not_terminator`); a Segment ID does not hold the segment terminator (`segment_id_no_terminator`); a field, a repetition and a component each hold at least one element (`field_has_repetition`, `repetition_has_component`, `component_has_subcomponent`); and a subcomponent holds no separator and no segment terminator (`subcomponent_no_separator`). The specification states them as rules of `Message.WF`. A proof shows they are enough, not that each is needed; a rule shown to be needed is recorded with its counterexample.

## Outside this list

Chapter 2 also covers message types and trigger events (§2.5.1), segment groups and the order of segments (§2.5.2), lengths and truncation (§2.5.5), acknowledgments (§2.9), batches (§2.10), local extensions (§2.11) and character sets (§2.14.9.18). They are not about how one message is written as text, and no row here covers them yet.

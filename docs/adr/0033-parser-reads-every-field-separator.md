# ADR 0033: The Parser Reads Every Field Separator as Written

## Status

Proposed (2026-10-24)

Answers #1090.

## Context

A segment's fields are separated by the field separator. The message construction rules of HL7v2 Chapter 2 say the same thing in every version from v2.4 to v2.8.2:

- A field, component, repetition, or subcomponent that holds no value is not present, and a sender need not write the delimiters after the last one present: "the two data fields are equivalent: `|ABC^DEF^^|` and `|ABC^DEF|`", and "If all the data fields remaining in the segment definition are not present there is no requirement to include any more delimiters" (v2.4 §2.11). From v2.5 the rules are pseudocode that writes a field separator before each field and stops after the last populated field (`break if last ( populated field )`), and writes a component, repetition, or subcomponent separator only before a populated one (§2.6.1).
- A receiver ignores what is present but was not expected, and treats what was expected but not included as not present (§2.6.2).
- The null value `""` is a value, and "is different from omitting an optional data field" (§2.5.3).

So `PID|12`, `PID|12|`, and `PID|12|^^|` carry the same data.

Until now `@glion/parser` read every separator except the last. `PID|12|` became one field, `12`, and `PID|a||` became `a` and one empty field. Components, repetitions, and subcomponents kept their trailing empties, so the levels disagreed, and the tree was not the text that was read:

- **A message took two round trips to settle.** `PID|a||` was written back as `PID|a|`, and that as `PID|a`. In the default pipeline 57 to 82 of 20,000 adversarial inputs in `@glion/qa` did not round-trip in one pass.
- **Special cases grew around the drop.** The parser kept a trailing `|^|` because it holds a delimiter, `@glion/to-hl7v2` had a `trailingDelimiter` option to write the dropped separator back, and `@glion/qa` stripped trailing separators before comparing a message with its round trip.
- **Some separators were lost outright.** After a segment holding only its Segment ID, a line `|` was lost (#1093).

## Decision

1. **Every field separator after the Segment ID opens a field.** `PID|12|` is `s("PID", f("12"), f())`, `PID|` is `s("PID", f())`, and `PID` is `s("PID")`. The Segment ID is the text before the first field separator of its line, whatever it holds: a line that starts with `|` has an empty Segment ID, so `|` is `s("", f())` and `|A` is `s("", f("A"))`, and `^A|B` is `s("^A", f("B"))`. Each of these is written back as it was read.

2. **`@glion/to-hl7v2` writes the tree as it is.** Every field is written with its separator, so a message read and written back is the same text. The `trailingDelimiter` option is removed, and no option takes its place.

3. **Leaving out trailing empty fields changes the tree, not the writing.** No package removes fields as it writes a message: not the serializer, not `@glion/mllp-client` when it cleans a message before sending it, and not `glion send`. A pipeline that wants the shortest form removes the empty fields from the tree before the serializer runs, so the change is a step of the pipeline that says so.

4. **An empty field is one HL7v2 treats as not present.** A field is empty when none of its components, repetitions, or subcomponents holds a value, so `||`, `|^^|`, `|~|`, and `|&|` are all empty. `|""|` is not: `""` is the HL7v2 null value, which tells the receiver to delete the value it holds. `isEmptyNode` in `@glion/utils` is the one definition, and both lint rules use it.

5. **Lint rules count what the sender wrote.** `@glion/lint-no-trailing-empty-field` reports a segment that ends with two or more empty fields, and one with `strict: true`; `strict: true` follows the sender rule, and it is off by default, since senders often end a segment with one `|`. `@glion/lint-profile-extra-fields` counts fields up to the last one with a value, so empty fields after a segment's last defined field are not extra data (§2.6.2); with `strict: true` it counts every field the segment holds.

## Consequences

- A tree changes for every message with a trailing field separator: each segment that ends with `|` gains an empty last field, and `@glion/jsonify` outputs it as `""`.
- A segment that ends with one `|` is written back with it. A caller that wants the shortest form removes the trailing empty fields from the tree before the serializer runs.
- `@glion/lint-no-trailing-empty-field` reports the empty fields the sender wrote, so its counts are one higher than before. A segment that ends with one `|` is still not reported by default.
- The `@glion/qa` round-trip properties compare a message with its round trip exactly, with no trailing normalization.

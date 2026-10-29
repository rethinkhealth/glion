# How `@glion/parser` reads a message

This document is for contributors and reviewers. It follows one message through the parser, then states each rule the parser applies and the module that owns it. The public contract is the [README](./README.md).

## The steps

`parseHL7v2(input, options, settings)` reads a message in four steps. No step rewrites the input, so every position in the tree is a span of the text as it was given.

| Step                 | Module            | What it does                                                                                                    |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Context           | `parser.ts`       | Holds the input and the delimiters: the defaults, then the settings' delimiters over them.                      |
| 2. Preprocessing     | `preprocessor.ts` | Runs the preprocessing steps. The default, `detectDelimiters`, sets the delimiters the message header declares. |
| 3. Tokenizing        | `tokenizer.ts`    | Reads the input into tokens: delimiters, segment terminators, and runs of text, each with its span.             |
| 4. Building the tree | `processor.ts`    | Builds the `Root` from the tokens.                                                                              |

Two modules hold rules that steps 2 and 3 share, so that both read the message the same way:

| Module                   | Owns                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `segment-terminators.ts` | What ends a segment: the segment delimiter, a carriage return and a line feed, or a line feed.    |
| `message-header.ts`      | The start of a message: a byte order mark, `MSH`, MSH-1, and the encoding characters MSH-2 holds. |

## One message, step by step

The message `MSH|^~\&|A^B` + CR LF + `PID|1` + CR, 20 characters long.

**Preprocessing.** `detectDelimiters` reads the message header. MSH-1 is `|`, so the field delimiter is `|`. MSH-2 holds `^~\&`, so the component, repetition, escape, and subcomponent delimiters are `^`, `~`, `\`, and `&`. The message header does not declare the segment delimiter, so it stays `\r`.

**Tokenizing.** The tokenizer reads 14 tokens:

| Token             | Value  | Offsets | Rule                                       |
| ----------------- | ------ | ------- | ------------------------------------------ |
| `TEXT`            | `MSH`  | 0–3     | message header: the Segment ID             |
| `FIELD_DELIM`     |        | 3–3     | message header: MSH-1 opens                |
| `TEXT`            | `\|`   | 3–4     | message header: MSH-1, the field separator |
| `FIELD_DELIM`     |        | 4–4     | message header: MSH-2 opens                |
| `TEXT`            | `^~\&` | 4–8     | message header: the encoding characters    |
| `FIELD_DELIM`     |        | 8–9     | 2. the field delimiter                     |
| `TEXT`            | `A`    | 9–10    | 5. text                                    |
| `COMPONENT_DELIM` |        | 10–11   | 4. the component delimiter                 |
| `TEXT`            | `B`    | 11–12   | 5. text                                    |
| `SEGMENT_END`     |        | 12–14   | 1. a segment terminator: CR LF, read whole |
| `TEXT`            | `PID`  | 14–17   | 3. a Segment ID, on line 2                 |
| `FIELD_DELIM`     |        | 17–18   | 2. the field delimiter                     |
| `TEXT`            | `1`    | 18–19   | 5. text                                    |
| `SEGMENT_END`     |        | 19–20   | 1. a segment terminator                    |

**Building the tree.** The processor opens the segment MSH at its Segment ID. Each field delimiter opens a field, so MSH holds MSH-1 `|`, MSH-2 `^~\&`, and MSH-3 with the components `A` and `B`. The segment terminator closes MSH, which ends at offset 12, its last character. PID holds one field, `1`, and covers 14–19. The root covers 0–20, both segment terminators included.

## Rules

### What ends a segment

`segmentTerminatorAt(input, at, segment)` in `segment-terminators.ts` is the one place that decides it. At `at` it reads, in this order:

1. a carriage return and a line feed, read whole as one terminator;
2. the segment delimiter, `\r` unless the settings give another;
3. a line feed.

HL7v2 ends every segment with a carriage return. A message saved to a file often ends its segments with the file's line endings instead, so the parser reads those too. With another segment delimiter, such as `$`, a carriage return alone is data: `PID|a` + CR + `b$` holds the value `a` + CR + `b`.

Every rule that stops at the end of a segment calls this function: the tokenizer's segment terminator, Segment ID, and text rules, and both readings of the message header.

### The message header

`message-header.ts` reads the start of the message:

- A byte order mark at offset 0 is not part of the message, which starts at offset 1.
- The message opens with a message header segment when it starts with `MSH` followed by a character that is not a segment terminator. `MSH` followed by a segment terminator is a segment with no fields.
- MSH-1 is the character after `MSH`. No delimiter opens it: the field separator is its value.
- MSH-2 holds up to four encoding characters, and ends at the next field delimiter or segment terminator. `MSH|^~\|APP` and `MSH|^~\` + CR both declare `^~\`.

Two steps read the header, each with the field delimiter it splits fields at. `detectDelimiters` ends MSH-2 at MSH-1, the only field delimiter it knows. The tokenizer ends MSH-2 at the field delimiter in its context, which `detectDelimiters` set to MSH-1. They differ only when a caller replaces the preprocessing steps and gives a field delimiter other than MSH-1.

The tokenizer emits the header as five tokens, read once in `reset()`, because its general rules would read MSH-1 as a field delimiter and the encoding characters as delimiters. The two `FIELD_DELIM` tokens before MSH-1 and MSH-2 span no characters. An MSH-2 longer than four characters, such as `^~\&#`, is read on by the general rules: `#` is the next token.

### Tokenizing

After the header, `next()` tries these rules at the current offset, in order. The first that applies reads the token:

1. **A segment terminator** ends the segment.
2. **The field delimiter** opens a field.
3. **A Segment ID**, at the start of a segment only: the text up to the first field delimiter or segment terminator, whatever it holds. `^A|B` opens with the Segment ID `^A`, and `Z\R\Z|B` with `Z\R\Z`, not decoded. A segment starts at the start of the message and after each segment terminator.
4. **The repetition, component, and subcomponent delimiters.**
5. **Text**, up to the next delimiter or segment terminator.

The order matters. The segment terminator comes first, so a line break is never read as text. The field delimiter comes before the Segment ID, so a line that starts with `|` has an empty Segment ID. The Segment ID comes before the other delimiters, so `^` at the start of a line is part of a Segment ID, not a component delimiter.

### Escape sequences

A text token whose characters include the escape delimiter is decoded with `decodeEscapes` from `@glion/utils`, unless `decodeEscapes: false` is given. Two kinds of text are never decoded:

- a Segment ID, which rule 3 reads without decoding;
- MSH-2, which holds the encoding characters as written. The tokenizer decodes text only from the offset MSH-2 ends at, so the tail of a long MSH-2, `\F\` in `MSH|^~\&\F\|a`, is not decoded either.

A token's span covers the text as written, so a decoded value can be shorter than its span.

### Positions

- Offsets and columns count UTF-16 code units, as `String.prototype.slice` does.
- Each segment terminator starts a new line, whatever characters it holds: CR LF is one line break.
- A segment ends at its last character, before its segment terminator.
- The root covers every token, from the first to the last, so it ends after the segment terminators that follow the last segment, or at the last segment when none follows it.

### Building the tree

`processor.ts` reads the tokens in order and keeps the segment, field, field repetition, component, and subcomponent being built.

- A Segment ID opens a segment. A delimiter that arrives before any Segment ID opens a segment with an empty Segment ID.
- Each delimiter opens the next sibling at its level: a field delimiter opens a field, a repetition delimiter a field repetition, and so on. A sibling it skips is added empty, so `PID|~` holds a field with two empty field repetitions.
- A field, field repetition, or component with no value has `children: []`. `PID|1||` holds three fields, the last two empty.
- A segment terminator closes the segment.

## Tests

| Directory             | What it checks                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/*.test.ts`     | Each module's contract, mirroring `src/`.                                                                                                         |
| `tests/regressions/`  | One file per fixed bug, named after the issue and the symptom.                                                                                    |
| `tests/differential/` | The tokenizer and delimiter detection against a second implementation in `tests/differential/reference/`, over generated text and delimiter sets. |

The reference in `tests/differential/reference/` is the tokenizer and delimiter detection as they were written before the modules above were refactored. The properties in `tests/differential/` generate text from the pieces where the rules meet (the header, every delimiter, each segment terminator, escape sequences, a byte order mark) and assert that both implementations emit the same tokens, values, and positions, and detect the same delimiters. A change to what the parser reads is made in `src/` and in the reference, so the two stay one specification written twice.

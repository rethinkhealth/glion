# ADR 0036: Escape Sequences Decode Only What the Message Structure Requires

## Status

Proposed (2026-10-31). Supersedes [ADR 0031](./0031-escape-sequences-decoded-by-the-parser.md).

Answers #1165, #1166, #1167, and #1168.

## Context

A subcomponent's `value` is one string. ADR 0031 made it the value's content: the parser decodes the five delimiter sequences (`\F\`, `\S\`, `\R\`, `\T\`, `\E\`), `\Xdd…\` as UTF-8, and `\.br\` as a carriage return, and keeps every other sequence in the string as written. The serializer encodes the string again and copies the kept sequences through when they match a fixed list (`\H\`, `\N\`, formatting commands other than `\.br\`, `\Z…\`, `\C…\`, `\M…\`).

Comparing glion with a written-out model of HL7v2 §2.7 in Lean found four ways a message read and written back is not the message that arrived:

| Issue | Received                  | Value                     | Written back                  |
| ----- | ------------------------- | ------------------------- | ----------------------------- |
| #1165 | `\E\H\E\`, the data `\H\` | `\H\`                     | `\H\`, a highlighting command |
| #1166 | `abcde\P\`, `\Q\`         | `abcde\P\`, `\Q\`         | `abcde\E\P\E\`, `\E\Q\E\`     |
| #1167 | `a\X0D\b`                 | `a`, carriage return, `b` | `a\.br\b`                     |
| #1168 | `caf\XC3A9\`              | `café`                    | `café`                        |

All four have one cause. Decoding merges two different wire values into one string whenever the decoded character is the escape character itself (#1165: data `\H\` and the command `\H\`), or whenever the character has a second wire form (#1167: `\X0D\` and `\.br\`; #1168: `\XC3A9\` and a raw `é`). No serializer can write both wire values back from one string. The fixed list then guesses which kept text is a sequence, and guesses wrong for codes not on it (#1166).

HL7v2 (Chapter 2, v2.8.2) gives each sequence one meaning:

- §2.7.1: "When delimiters are included in any component, the delimiters SHALL be escaped." The list it gives for every data type is `\F\`, `\S\`, `\T\`, `\R\`, `\E\`, and `\P\`. A data `\` is always sent as `\E\`, so a raw `\` in a value always starts a sequence.
- §2.7.1 limits `\H\`, `\N\`, `\Xdddd…\`, and `\Zdddd…\` to TX, FT, and CF, and says nothing about a code it does not define.
- §2.7.1: "For the purposes of determining length, all the characters inside the escape (all between the opening and closing \, not including the \ symbols themselves) count towards the length."
- §2.7.6: "Consecutive pairs of the hexadecimal digits represent 8-bit binary values. The interpretation of the data is entirely left to an agreement between the sending and receiving applications."
- §2.7.7: `.br` means "Begin new output line." It is an instruction for display, defined for FT.

HAPI's `DefaultEscaping` has the same shape as ADR 0031 and the same ambiguity: it unescapes `\E\` and passes through text shaped like a formatting sequence, so literal text such as `C:\Chris\` "will be interpreted as a formatting code by the receiver". HL7's own XML encoding avoids it by structure: the text is decoded and each sequence is an element, `<escape V="H"/>`.

## Decision

1. **A sequence is decoded only when it passes two tests.** The character it stands for is never the escape character, so a decoded character cannot be mistaken for the start of a sequence. And that character is never written as it is, so its escape is the one form glion writes and reads, and a relay never rewrites one form as another. The separators qualify, since the parser splits a value at them. So does every character below U+0020: the parser ends a segment at a carriage return and, by default, at a line feed, MLLP frames a message with 0x0B and 0x1C, and many receivers end a segment at a line feed.

2. **The table.** With the delimiters a message declares, these characters pass both tests, each with its one form:

   | Character in the value                                             | Wire form                                                                             |
   | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
   | field, component, repetition, subcomponent separator               | `\F\`, `\S\`, `\R\`, `\T\`                                                            |
   | a character below U+0020, such as a carriage return or a line feed | its `\Xdd\`, such as `\X0D\` and `\X0A\`                                              |
   | a separator whose named code holds a delimiter (#1051)             | its `\Xdd\`, with a digit `A`–`F` in lowercase when its uppercase form is a delimiter |

   The decoder and the encoder read the same table: the decoder turns a code into its character only when that code is the one the encoder writes for it, so `\X0d\`, `\X0D0A\`, and `\X7C\` (with `\F\` writable) stay as written.

3. **The parser decodes the table and keeps everything else as written.** A table form becomes its character. Every other sequence stays in the value with its escape characters: `\E\`, `\P\`, `\H\`, `\N\`, every formatting command including `\.br\`, `\X…\` other than a table form, `\Z…\`, `\C…\`, `\M…\`, an unknown code, and an escape character without a closing one.

4. **The serializer always encodes, with one rule for the escape character.** A table character is written as its form. An escape character that opens a pair whose content holds no table character is copied with its pair, whatever the code. Any other escape character is data and is written `\E\`: `a\b|c` is written `a\E\b\F\c`, and `\Zfoo|bar\` is written `\E\Zfoo\F\bar\E\`. The serializer writes every string; it throws `EscapeSequenceError` only for a table character whose form and hexadecimal fallback both hold a delimiter (#1053).

5. **The contract.** For every value `w` the parser reads with its default settings, in which each escape character has a closing one and no character is below U+0020, `encodeEscapes(decodeEscapes(w, d), d)` is `w`. `decodeEscapes` and `encodeEscapes` are each idempotent: a decoded character is never the escape character, so the pairs left in a value do not move, and an encoded value holds no table character.

6. **No options and no escape plugins.** The parser always decodes and the serializer always encodes. `decodeEscapes: false` on `hl7v2Parser`, `encodeEscapes: false` on `hl7v2ToHl7v2`, `@glion/decode-escapes`, and `@glion/encode-escapes` are no longer needed: a value in wire form and the same value decoded are written as the same message, and decoding twice is harmless. They are removed in a later change, since the two packages are published and are deprecated on npm first.

7. **Display is a view, not the tree; free text enters through `escapeText`.** A view of a value as a reader sees it (`\E\` as the escape character, `\.br\` as a line break, `\X…\` as the characters its bytes encode under the character set the caller names, UTF-8 by default per #659) never changes the tree and is not part of the round trip; it belongs to formatted-text rendering (#1002). `escapeText(text, d)` in `@glion/utils` turns free text into a value: each escape character becomes `\E\`, or its hexadecimal escape when `E` is a delimiter.

## Consequences

- #1165, #1166, and #1167 are fixed by the contract: every sequence the parser keeps is written back as it arrived. #1168 is answered by the view: a value keeps `\XC3A9\` and `\.br\`, and a reader decodes them.
- A value holds plain characters for the separators, which are the escapes that occur in identifiers, names, and addresses: `Johnson \T\ Johnson` is the value `Johnson & Johnson`. A lint rule, a table lookup, and `@glion/util-query` see `&`.
- Breaking changes for consumers of `value`: `\.br\` is no longer a carriage return, `\XC3A9\` is no longer `é`, and `\E\` is no longer the escape character. Each stays as written, and the view gives the old reading. A carriage return in a value is written `\X0D\`, not `\.br\`.
- A value built from free text, such as a path `C:\temp`, holds the escape character as data only when written `\E\`. `escapeText(text, d)` makes it so, and the serializer does the rest. An escape character left bare in such text is written as `\E\` when it opens no pair, and copied as a sequence when it does.
- The serializer repairs an escape character without a closing one: `a\b` is written `a\E\b`. A relay changes such a message; a lint rule for malformed escape sequences would report the input.
- A character below U+0020 that arrives raw in a value, such as a tab, or a line feed read with `lineBreaks: false`, is written back as its `\Xdd\`.
- A field-length rule counts a value as §2.7.1 counts it: each kept sequence by the characters inside it, a separator as one, and a character below U+0020 as three, the characters of its form.
- The values in a tree hold formatting commands as text. Highlighting and formatted-text support will hold each sequence as its own node beside the text, as HL7's XML encoding does; the table and the round trip stay as they are.

## Alternatives considered

- **Decode `\E\` and the table, keep the other sequences, and reject the ambiguous values.** The parser would fail a message whose decoded `\E\` forms a recognised sequence, such as `\E\H\E\`, and one with an unknown code. It needs a recogniser of the §2.7 grammar shared by both ends, and that recogniser becomes the contract: teaching it a new code changes how an accepted tree is written.
- **Hold each sequence as a node** (`text` and `escape` children of a subcomponent). Lossless and unambiguous, but every consumer of `subcomponent.value` changes. It is the shape planned for highlighting support.
- **Decode nothing.** The value is the wire text, and the round trip holds without a table. Every consumer then sees `\T\` for `&`, and needs `text()` for the separators as well.
- **Decode every sequence a reader would, and reject the rest.** Strict and exact, but a server rejects every result whose OBX-5 holds `\.br\` unless each client configures a table of its own.

## Follow-ups

- Remove the `decodeEscapes` and `encodeEscapes` options, and deprecate `@glion/decode-escapes` and `@glion/encode-escapes`.
- The view of a value for display, with formatted-text rendering (#1002).
- A lint rule that reports malformed escape sequences: an escape character without a closing one, and a code HL7v2 does not define.

`\.br\` stays out of the table. As the form of a line feed it would make narratives read with line breaks, but it would write an FT formatting command into fields of other types, which §2.7.1 does not allow.

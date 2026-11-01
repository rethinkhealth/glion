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
- §2.7.1: "Escape sequences SHALL NOT contain nested escape sequences."
- §2.7.1 limits `\H\`, `\N\`, `\Xdddd…\`, and `\Zdddd…\` to TX, FT, and CF, and says nothing about a code it does not define.
- §2.7.1: "For the purposes of determining length, all the characters inside the escape (all between the opening and closing \, not including the \ symbols themselves) count towards the length."
- §2.7.6: "Consecutive pairs of the hexadecimal digits represent 8-bit binary values. The interpretation of the data is entirely left to an agreement between the sending and receiving applications."
- §2.7.7: `.br` means "Begin new output line." It is an instruction for display, defined for FT.

HAPI's `DefaultEscaping` has the same shape as ADR 0031 and the same ambiguity: it unescapes `\E\` and passes through text shaped like a formatting sequence, so literal text such as `C:\Chris\` "will be interpreted as a formatting code by the receiver". HL7's own XML encoding avoids it by structure: the text is decoded and each sequence is an element, `<escape V="H"/>`.

## Decision

**Glion changes only the characters that cannot appear in a value as they are. Everything else, the escape character included, stays exactly as written in both directions.**

1. **The characters that cannot appear in a value as they are.** The separators cannot, since the parser splits a value at them. Neither can a character below U+0020: the parser ends a segment at a carriage return and, by default, at a line feed, MLLP frames a message with 0x0B and 0x1C, and many receivers end a segment at a line feed. Each of these characters is written as one escape sequence and read from that sequence alone, so a relay never rewrites one form as another. The escape character is not one of them: it appears in a value as it is, at the start and end of each escape sequence.

2. **What glion manages: the table.** With the delimiters a message declares:

   | Character in the value                                             | Wire form                                                                             |
   | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
   | field, component, repetition, subcomponent separator               | `\F\`, `\S\`, `\R\`, `\T\`                                                            |
   | a character below U+0020, such as a carriage return or a line feed | its `\Xdd\`, such as `\X0D\` and `\X0A\`                                              |
   | a separator whose named code holds a delimiter (#1051)             | its `\Xdd\`, with a digit `A`–`F` in lowercase when its uppercase form is a delimiter |

   The parser turns each wire form into its character, and the serializer turns each character into its wire form. The parser decodes a code only when it is the one the serializer writes for that character, so `\X0d\`, `\X0D0A\`, and `\X7C\` (with `\F\` writable) stay as written.

3. **What glion leaves as written.** Every other escape sequence: `\E\`, `\P\`, `\H\`, `\N\`, every formatting command including `\.br\`, `\X…\` other than a table form, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define. And every escape character, including one without a closing one. The parser keeps each of them in the value, and the serializer copies each of them to the wire.

4. **The contract.** For every value `w` on the wire that holds no character below U+0020, `escapes.write(escapes.read(w, d), d)` is `w`. `escapes.read` and `escapes.write` are each idempotent. A written value holds no separator and no character below U+0020, so the parser splits a written message where its delimiters are. The serializer throws `EscapeSequenceError` only for a separator or control character whose form and hexadecimal fallback both hold a delimiter (#1053).

5. **One API, named after what a user does: `escapes.read` and `escapes.write`.** `@glion/utils` exports one object, `escapes`, with the two directions as its methods: `read` is what the parser does to a value, and `write` is what the serializer does. They replace `decodeEscapes` and `encodeEscapes`, which read as siblings of the byte layer's `decodeBytes` and `encodeBytes`. Both methods take their characters and codes from one rule (which characters are escaped, the code that writes each, the character each code stands for), and `read` accepts a code only when the rule writes that character with that code. The rule is internal for now. When escaping becomes configurable, a factory builds an `escapes` object from another rule, such as one that reads `\.br\` as a line break in FT or reads `\X…\` under the MSH-18 character set; the parser and the serializer take it as an `escapes` option in place of their two booleans; and every such object keeps reading and writing in agreement, since the check on `read` belongs to the object and not to the rule.

6. **The on/off switches and the escape plugins stay, on `escapes`.** The parser reads and the serializer writes by default. `decodeEscapes: false` on `hl7v2Parser` and `encodeEscapes: false` on `hl7v2ToHl7v2` keep a tree in wire form, and `@glion/decode-escapes` and `@glion/encode-escapes` apply `escapes.read` and `escapes.write` to such a tree, so a plugin reads and writes a value as the parser and the serializer do. The two booleans give way to the `escapes` option of decision 5 when escaping becomes configurable.

7. **Display is a view, not the tree.** A view of a value as a reader sees it (`\E\` as the escape character, `\.br\` as a line break, `\X…\` as the characters its bytes encode under the character set the caller names, UTF-8 by default per #659) never changes the tree and is not part of the round trip; it belongs to formatted-text rendering (#1002).

## Consequences

- #1165, #1166, and #1167 are fixed by the contract: every sequence the parser keeps is written back as it arrived. #1168 is answered by the view: a value keeps `\XC3A9\` and `\.br\`, and a reader decodes them.
- A value holds plain characters for the separators, which are the escapes that occur in identifiers, names, and addresses: `Johnson \T\ Johnson` is the value `Johnson & Johnson`. A lint rule, a table lookup, and `@glion/util-query` see `&`.
- Breaking changes for consumers of `value`: `\.br\` is no longer a carriage return, `\XC3A9\` is no longer `é`, and `\E\` is no longer the escape character. Each stays as written, and the view gives the old reading. A carriage return in a value is written `\X0D\`, not `\.br\`. An escape character in a value is no longer written as `\E\`.
- A field-length rule counts a value as §2.7.1 counts it: each kept sequence by the characters inside it, a separator as one, and a character below U+0020 as three, the characters of its form.
- The values in a tree hold formatting commands as text. Highlighting and formatted-text support will hold each sequence as its own node beside the text, as HL7's XML encoding does; the table and the round trip stay as they are.

## Drawbacks

- **Consumers see escape sequences in values.** `Smith\E\Jones` is the value, not `Smith\Jones`, and `\XC3A9\` is not `é`, until the view (#1002) exists.
- **A data escape character is the caller's to write.** A value built from free text holds HL7v2 text: a path `C:\scans\H\1.dcm` is written as it is, and a receiver reads `\scans\` and `\H\` as escape sequences. The caller writes `C:\E\scans\E\H\E\1.dcm` instead. Glion does not tell the two apart.
- **A malformed value is written malformed.** An escape character without a closing one is written as it is: `C:\temp` stays `C:\temp`, which a strict receiver may reject. A separator after such an escape character pairs with it once written: `a\b|c` is written `a\b\F\c`, and read back as `a\b\F\c`, since `\b\` reads as one sequence and §2.7.1 does not allow nested sequences. The message still splits where its delimiters are; only the escape sequences in that one value read differently. The parser never produces such a value, so only a value a caller builds has it, and the lint rule for malformed escape sequences would report it.
- **A raw control character is rewritten.** A character below U+0020 that arrives raw in a value, such as a tab, or a line feed read with `lineBreaks: false`, is written back as its `\Xdd\`.

## Alternatives considered

- **Write a stray escape character as `\E\`.** The serializer would repair `a\b` to `a\E\b`, and `\Zfoo|bar\` to `\E\Zfoo\F\bar\E\`. Since the parser keeps `\E\` as written, the repair changes the value: `C:\temp` is read back as `C:\E\temp`. It is the reverse of a decoding glion does not do.
- **Decode `\E\` and the table, keep the other sequences, and reject the ambiguous values.** The parser would fail a message whose decoded `\E\` forms a recognised sequence, such as `\E\H\E\`, and one with an unknown code. It needs a recogniser of the §2.7 grammar shared by both ends, and that recogniser becomes the contract: teaching it a new code changes how an accepted tree is written.
- **Hold each sequence as a node** (`text` and `escape` children of a subcomponent). Lossless and unambiguous, but every consumer of `subcomponent.value` changes. It is the shape planned for highlighting support.
- **Decode nothing.** The value is the wire text, and the round trip holds without a table. Every consumer then sees `\T\` for `&`, and needs the view for the separators as well.
- **Decode every sequence a reader would, and reject the rest.** Strict and exact, but a server rejects every result whose OBX-5 holds `\.br\` unless each client configures a table of its own.

## Follow-ups

- Replace the `decodeEscapes` and `encodeEscapes` options with an `escapes` option when escaping becomes configurable.
- The view of a value for display, with formatted-text rendering (#1002).
- A lint rule that reports malformed escape sequences: an escape character without a closing one, a separator inside a sequence, and a code HL7v2 does not define.

`\.br\` stays out of the table. As the form of a line feed it would make narratives read with line breaks, but it would write an FT formatting command into fields of other types, which §2.7.1 does not allow.

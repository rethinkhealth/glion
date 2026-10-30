# ADR 0031: Escape Sequences Are Decoded by the Parser and Encoded by the Serializer

## Status

Proposed (2026-10-16)

Answers #1000.

## Context

HL7v2 §2.7 writes a delimiter that occurs inside a value as an escape sequence: `\F\` for the field separator, `\S\`, `\R\`, `\T\` for the component, repetition, and subcomponent separators, `\E\` for the escape character itself, `\.br\` for a line break, and `\Xdd\` for a character given by its hexadecimal code. A value has two forms: the sequence of characters on the wire, and the content those characters stand for. `DOE\T\SMITH` on the wire is the content `DOE&SMITH`.

Until now `@glion/parser` put the wire form in each subcomponent's `value`, and `@glion/decode-escapes`, a transform in the default pipeline, replaced it with the content by walking every node of the tree. `@glion/to-hl7v2` wrote `value` back as it was, and a caller that wanted the content written as escape sequences again added `@glion/encode-escapes` before it. The arrangement had three costs:

- **A second pass over the tree.** Decoding walked every node to reach each subcomponent, on every message, while the tokenizer had already looked at every character and knew which values held an escape character. On a message without escape sequences the walk cost about 2.5 times the parse (#1000).
- **A silent corruption on the way out.** A tree from the default pipeline holds content. Written by `@glion/to-hl7v2` without the encoding transform, a value `a|b` becomes two fields, and a value holding a carriage return ends the segment. Nothing reports it. Whether the output is right depends on the caller remembering a plugin.
- **Two meanings for one property.** Before the transform ran, `value` held the wire form; after it, the content. A lint rule that measures a value's length or checks it against a table reads one or the other depending on where it sits in the pipeline.

The parsers that this project measures itself against put the content in the tree. micromark decodes character references while parsing, so an mdast text node holds `&` for `&amp;`, and remark-stringify writes the reference again. HAPI's `PipeParser` unescapes a value as it parses and escapes it as it encodes. An HL7v2 escape sequence is to a value what a character reference is to text.

## Decision

1. **A subcomponent's `value` is the content.** `@glion/parser` decodes escape sequences as it tokenizes: a TEXT token whose characters include the escape character is decoded with the delimiters the message declares, and every other token is taken as it is. The encoding characters in MSH-2 are never decoded. A node's `position` is the span of the source text, so a decoded value is shorter than its span.

2. **`@glion/to-hl7v2` writes the content as it must appear on the wire.** Each subcomponent value is written with the field, component, repetition, subcomponent, and escape delimiters as `\F\`, `\S\`, `\R\`, `\T\`, and `\E\`, the segment terminator, `\r`, as `\.br\`, and any other character below U+0020 as `\Xdd\`. MSH-1 and MSH-2 are written as they are.

3. **Both are the default, and each can be turned off.** `hl7v2Parser` takes `decodeEscapes: false` to keep the wire form in the tree, and `hl7v2ToHl7v2` takes `encodeEscapes: false` to write values as they are. The two options exist for a tree that must hold the wire form, such as one inspected for malformed escape sequences; a pipeline that turns one off and not the other writes a different message than it read.

4. **One pair of functions.** `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` live in `@glion/utils`, and `decodeEscapes(encodeEscapes(value, d), d)` is `value` for every string. The parser, the serializer, `@glion/decode-escapes`, and `@glion/encode-escapes` call them. The two plugins remain for trees handled with the options off; the default pipeline in `@glion/hl7v2` no longer runs `@glion/decode-escapes`.

5. **Character escapes are decoded; every other sequence is text.** The parser decodes the sequences that stand for characters: the five delimiter sequences, `\Xdd\`, and `\.br\`, the one formatting command that maps to a character. The other formatting commands of HL7v2 §2.7.6 (`\H\`, `\N\`, `\.sp\`, `\.in\`, `\.ti\`, `\.ce\`, `\.sk\`, `\.fi\`, `\.nf\`) are markup the receiving system renders, not characters; a locally defined sequence (`\Z…\`, §2.7.1) is meaningful only to the two systems that agreed on it; a character set switch (`\Cxxyy\`, `\Mxxyyzz\`, §2.7.2) is an instruction to the byte layer, which reads UTF-8 only (#662). All three stay in the value as written, as does any other sequence and an escape character without a closing one. The serializer writes a well-formed formatting command, locally defined sequence, or character set switch as it is and escapes any other escape character as `\E\`.

## Consequences

- A message without escape sequences is parsed in one pass, with one comparison per character added to the scan the tokenizer already runs. Parsing costs the same as before, and the default pipeline does the decoding transform's work for nothing.
- A message read and written back is the same text when its escape sequences are the standard ones. A `\X0D\` is written back as `\.br\`, since both decode to the segment terminator, `\r`. The bytes of a `\Xdd…\` are decoded as UTF-8, the one character set the byte layer reads (#659, #660), so `\XC3A9\` is `é` and is written back as `é`; a sequence whose bytes are not UTF-8, or that has an odd number of digits, stays as written.
- A decoded tree MUST NOT be decoded again. `\E\F\E\` on the wire is the content `\F\`; decoding it a second time gives `|`. `@glion/decode-escapes` documents this, and a pipeline that parses with the default and adds the transform is wrong.
- A formatting command, a locally defined sequence, and a character set switch are read and written back as they are, which the transform did not do for `\H\` and `\N\`. Content that literally held `\.sp 2\` or `\Z1\`, written on the wire as `\E\.sp 2\E\` or `\E\Z1\E\`, is written back as the sequence; HAPI accepts the same ambiguity. `\.br\` is excluded, since it decodes to a character: content that holds it is written as `\E\.br\E\` and reads back as it was. A locally defined sequence that holds a delimiter or a control character is content too, and is written as `\E\Z…\E\` with the delimiter escaped, so it never splits the message on the wire. A sequence that matches none of these, such as `\Q\` or a `\C…\` without four hexadecimal digits, stays in the value with its escape character and is written back as `\E\Q\E\`.
- The formatting commands are text, not structure. A package that renders or edits FT text as highlighted and indented runs would parse them out of the value; it is not built here.
- Lint rules read content. A length is the number of characters the value holds, and a table value is compared as written in the table. A rule that serializes a composite node to fill `actual` uses the serializer's default, so `actual` is HL7v2 text throughout: delimiters between parts and escape sequences inside them.
- `@glion/jsonify` and every consumer of a parsed tree see content, as they did after the transform ran. A consumer that read the wire form from a tree before the transform ran, or serialized a parsed tree expecting the wire form back, passes the option that keeps it.

---
"@glion/ast": minor
"@glion/builder": minor
"@glion/parser": minor
---

A segment records the characters that end it in `Segment.terminator` (ADR 0035). `@glion/parser` sets it to what ended the segment in the text it was read from (`\r`, `\n`, `\r\n`, or a segment delimiter set in the parser settings), and to `""` for a last segment with nothing after it; an empty line after a segment is not recorded. `s()` in `@glion/builder` sets it to `\r`, so a built segment carries the key. It is absent on a segment that was not read from text, and a serializer then writes the segment delimiter.

`@glion/parser` takes a `lineBreaks` option: `true`, the default, reads a line feed and a carriage return and a line feed as segment ends, as before; `false` ends a segment only at a carriage return, as HL7v2 Chapter 2 requires, or at a segment delimiter the settings give, and reads a line feed as data. A `SEGMENT_END` token's `value` holds the characters it covers.

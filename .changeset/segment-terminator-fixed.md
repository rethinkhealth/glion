---
"@glion/ast": minor
"@glion/utils": minor
"@glion/config": minor
"@glion/parser": minor
"@glion/to-hl7v2": minor
---

**Breaking:** the segment terminator is a carriage return, `\r`, and no setting changes it, as HL7v2 Chapter 2 requires: "The segment terminator is always a carriage return." `Delimiters` and `DEFAULT_DELIMITERS` no longer have a `segment` key, and a configuration that sets `settings.delimiters.segment` is rejected. `@glion/utils` exports `SEGMENT_TERMINATOR`, `"\r"`. The parser ends a segment at `\r`, `@glion/to-hl7v2` writes `\r` after each segment, `\.br\` decodes to `\r`, and `\r` in a value is written as `\.br\`; a line feed in a value is written as `\X0A\`, like any other control character.

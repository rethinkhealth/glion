---
"@glion/utils": minor
"@glion/parser": minor
"@glion/to-hl7v2": minor
"@glion/decode-escapes": minor
"@glion/encode-escapes": minor
---

**Breaking:** change only the characters that cannot appear in a value as they are, the separators and the control characters, and keep everything else as written in both directions, so a message read and written again is the message that was sent.

- Decode `\F\`, `\S\`, `\R\`, and `\T\` to the separators, and the `\Xdd\` of a character below U+0020, such as `\X0D\`, to that character. Keep every other sequence in the value as written: `\E\`, `\P\`, `\H\`, `\N\`, `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define.
- Change `\.br\` to stay as written instead of decoding to a carriage return, `\XC3A9\` to stay as written instead of decoding to `é`, and `\E\` to stay as written instead of decoding to the escape character.
- Write a carriage return in a value as `\X0D\` instead of `\.br\`, so `\X0D\` is no longer written back as `\.br\`.
- Write every escape character in a value as it is, so `\P\`, `\Q\`, and `\XFF\` are no longer written back as `\E\P\E\`, `\E\Q\E\`, and `\E\XFF\E\`, and `C:\temp` is no longer written as `C:\E\temp`. A data escape character is written `\E\` in the value.
- Replace `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` in `@glion/utils` with `escapes.read(text, delimiters)` and `escapes.write(value, delimiters)`.
- Change `@glion/decode-escapes` and `@glion/encode-escapes` to apply `escapes.read` and `escapes.write` to every subcomponent value, so a plugin reads and writes a value as `@glion/parser` and `@glion/to-hl7v2` do.

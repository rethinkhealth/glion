---
"@glion/utils": minor
"@glion/parser": minor
"@glion/to-hl7v2": minor
"@glion/decode-escapes": minor
"@glion/encode-escapes": minor
"@glion/hl7v2": minor
"@glion/mllp-client": minor
"@glion/cli": minor
---

**Breaking:** change only the characters that cannot appear in a value as they are, the separators and the control characters, and keep everything else as written in both directions, so a message read and written again is the message that was sent.

- Decode `\F\`, `\S\`, `\R\`, and `\T\` to the separators, and the `\Xdd\` of a character below U+0020, such as `\X0D\`, to that character. Keep every other sequence in the value as written: `\E\`, `\P\`, `\H\`, `\N\`, `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define.
- Change `\.br\` to stay as written instead of decoding to a carriage return, `\XC3A9\` to stay as written instead of decoding to `é`, and `\E\` to stay as written instead of decoding to the escape character. A value read by `@glion/parser`, `@glion/hl7v2`, the NAK and ACK text of `@glion/mllp-client`, and the output of `glion send` hold these sequences as written.
- Write a carriage return in a value as `\X0D\` instead of `\.br\`, so `\X0D\` is no longer written back as `\.br\`. With `X`, `0`, or both `D` and `d` among the delimiters, a value holding a carriage return now throws `EscapeSequenceError`.
- Write every escape sequence in a value as it is, so `\P\`, `\Q\`, and `\XFF\` are no longer written back as `\E\P\E\`, `\E\Q\E\`, and `\E\XFF\E\`, and `C:\temp` is no longer written as `C:\E\temp`. A data escape character is written `\E\` in the value, or `\X5C\` when `E` is a delimiter.
- Write an escape character as `\E\` when a separator or a control character comes after it and before its closing one, or the end of the value when it has none, so that it does not pair with their escape sequences: `a\b|c` is written `a\E\b\F\c`, and a tab after a bare `\` is kept through a relay.
- Replace `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` in `@glion/utils` with `escapes.read(text, delimiters)` and `escapes.write(value, delimiters)`.
- `getLength` and `@glion/lint-profile-field-max-length` count the characters a value holds, so `12\E\3`, which now stays as written, is 6 characters long, not 4.
- Change `@glion/decode-escapes` and `@glion/encode-escapes` to apply `escapes.read` and `escapes.write` to every subcomponent value outside MSH-1 and MSH-2, with the delimiters MSH declares when no other delimiters are given, so a plugin reads and writes a value as `@glion/parser` and `@glion/to-hl7v2` do.

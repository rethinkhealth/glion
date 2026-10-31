---
"@glion/utils": minor
"@glion/parser": minor
"@glion/to-hl7v2": minor
"@glion/decode-escapes": minor
"@glion/encode-escapes": minor
---

**Breaking:** decode only the escape sequences the message structure requires, and write every other sequence back as it arrived, so a message read and written again is the message that was sent.

- Decode `\F\`, `\S\`, `\R\`, and `\T\` to the separators, and the `\Xdd\` of a character below U+0020, such as `\X0D\`, to that character. Keep every other sequence in the value as written: `\E\`, `\P\`, `\H\`, `\N\`, `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, and a code HL7v2 does not define.
- Change `\.br\` to stay as written instead of decoding to a carriage return, `\XC3A9\` to stay as written instead of decoding to `é`, and `\E\` to stay as written instead of decoding to the escape character.
- Write a carriage return in a value as `\X0D\` instead of `\.br\`, so `\X0D\` is no longer written back as `\.br\`.
- Write every escape sequence in a value as it is, whatever its code, so `\P\`, `\Q\`, and `\XFF\` are no longer written back as `\E\P\E\`, `\E\Q\E\`, and `\E\XFF\E\`.
- Write an escape character that starts no sequence, or whose sequence would hold a separator, as `\E\`: `a\b|c` is written `a\E\b\F\c`.
- Add `escapeText(text, delimiters)` to `@glion/utils`, which writes each escape character of free text as `\E\` so that it is written as data.

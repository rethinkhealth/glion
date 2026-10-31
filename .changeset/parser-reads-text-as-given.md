---
"@glion/parser": minor
---

**Breaking:** the parser reads the text it is given and never rewrites it, so every `position` is a span of that text (ADR 0034). A segment ends at `\r`, `\n`, or `\r\n`. Before, the default preprocessing steps replaced each `\r\n` with `\r`, so every position after a `\r\n` pointed one character early (#1139). A byte order mark is still removed by `stripBOM`, and positions count from the character after it.

**Breaking:** the root's `position` covers the message from its first character to its last, the line breaks after its last segment included: `MSH|^~\&\rPID|1\r` gives a root at 0–15, not 0–14. A segment still ends at its last character, before its line break. A finding placed at the end of the message, such as a segment missing at the end in `@glion/lint-profile-segment-order`, is now after those line breaks: with one segment terminator, at the start of the next line.

**Breaking:** the `normalizeNewlines` preprocessing step is removed, and `defaultPreprocessors` holds `stripBOM` and `detectDelimiters`.

An MSH-2 shorter than four characters ends at the first field delimiter or line break, and so do the encoding characters `detectDelimiters` reads: `MSH|^~\` followed by `\r` no longer swallows the next segment into MSH-2, and `MSH|^~\|APP` no longer swallows MSH-3 (#1140). `MSH` followed by a line break is read as a segment with no fields. `HL7v2Tokenizer.next()` before `reset()` returns `null`. `parseHL7v2` throws a `TypeError` when its input is not a string, such as the `Buffer` a file read without an encoding gives, instead of failing inside a preprocessing step.

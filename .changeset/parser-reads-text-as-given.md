---
"@glion/parser": minor
---

**Breaking:** the parser reads the text it is given and never rewrites it, so every `position` is a span of that text (ADR 0034). A segment ends at `\r`, `\n`, or `\r\n`, and a byte order mark at the start of the input is skipped. A segment delimiter given in the settings ends a segment as well, and no longer replaces the carriage return: with `$`, a `\r` alone used to be read as data. Before, the default preprocessing steps removed the byte order mark and replaced each `\r\n` with `\r`, so every position after a `\r\n` or a byte order mark pointed one character early (#1139).

**Breaking:** the root's `position` covers the message from its first character to its last, the line breaks after its last segment included: `MSH|^~\&\rPID|1\r` gives a root at 0–15, not 0–14. A segment still ends at its last character, before its line break. A finding placed at the end of the message, such as a segment missing at the end in `@glion/lint-profile-segment-order`, is now at the start of the line after the last segment.

**Breaking:** the `stripBOM` and `normalizeNewlines` preprocessing steps are removed, and `defaultPreprocessors` holds only `detectDelimiters`, which reads MSH after a byte order mark. A custom `preprocess` step receives the input as given, a byte order mark included.

An MSH-2 shorter than four characters ends at the first field delimiter or line break, and so do the encoding characters `detectDelimiters` reads: `MSH|^~\` followed by `\r` no longer swallows the next segment into MSH-2, and `MSH|^~\|APP` no longer swallows MSH-3 (#1140). `MSH` followed by a line break is read as a segment with no fields.

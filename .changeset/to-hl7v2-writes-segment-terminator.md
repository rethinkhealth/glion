---
"@glion/to-hl7v2": minor
---

**Breaking:** `toHl7v2()` and the `hl7v2ToHl7v2` compiler write each segment of a `Root` or `Group` followed by its `terminator`, so a parsed message is written back with the line breaks it was read with, a last segment with nothing after it included. A segment with an empty or absent `terminator` has no segment terminator: nothing is written after it when it is the last segment, and the segment delimiter, `\r` unless `delimiters` gives another, after any other. `delimiters.segment` no longer changes a segment that has a terminator. A segment made with `@glion/builder` ends with `\r`. Apply `@glion/transform-segment-terminator` to write every segment with `\r`.

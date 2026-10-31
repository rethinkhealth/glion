---
"@glion/to-hl7v2": minor
---

**Breaking:** `toHl7v2()` and the `hl7v2ToHl7v2` compiler write each segment of a `Root` or `Group` followed by its `terminator`, so a parsed message is written back with the line breaks it was read with, a last segment with nothing after it included. A last segment with an empty `terminator` is written with nothing after it; any other throws `SegmentTerminatorError`, because it would join the next segment. A segment made with `@glion/builder` ends with `\r`. Apply `@glion/transform-segment-terminator` to write every segment with `\r`.

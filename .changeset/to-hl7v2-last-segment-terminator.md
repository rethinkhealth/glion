---
"@glion/to-hl7v2": minor
---

**Breaking:** `toHl7v2()` and the `hl7v2ToHl7v2` compiler write the segment terminator after every segment of a `Root` or `Group`, the last one included, as HL7v2 Chapter 2 requires: `MSH|^~\&\rPID|1\r`, not `MSH|^~\&\rPID|1`. A message read without a terminator after its last segment, or with more than one, is written with exactly one. A `Segment` on its own is still written without a terminator.

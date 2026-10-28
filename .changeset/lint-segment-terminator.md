---
"@glion/lint-segment-terminator": minor
---

New lint rule: `@glion/lint-segment-terminator` reports a segment that ends with a line feed, or with a carriage return and a line feed, and a last segment with no segment terminator. HL7v2 ends every segment with a carriage return, the last one included.

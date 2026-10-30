---
"@glion/lint-segment-terminator": minor
---

New lint rule: `@glion/lint-segment-terminator` reports a segment that ends with a line feed, or with a carriage return and a line feed, and a last segment with no segment terminator, from the `terminator` `@glion/parser` records on each segment. HL7v2 ends every segment with a carriage return, the last one included. `@glion/preset-lint-recommended` runs it, at its default severity, `warning`.

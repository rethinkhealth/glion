---
"@glion/transform-segment-terminator": minor
---

New plugin: `@glion/transform-segment-terminator` sets the `terminator` of every segment, segments inside groups included, to `\r`, the segment terminator HL7v2 requires, whatever line break it was read with. It changes the tree in place.

---
"@glion/transform-segment-terminator": minor
---

New plugin: `@glion/transform-segment-terminator` returns a copy of the tree in which every segment, segments inside groups included, ends with `\r`, the segment terminator HL7v2 requires, whatever line break it was read with. `terminateSegments(tree)` is the same as a function.

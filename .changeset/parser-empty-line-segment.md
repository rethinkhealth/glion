---
"@glion/parser": minor
---

**Breaking:** an empty line is read as a segment with an empty Segment ID, no fields, and the terminator that ended it, so a message is written back with its empty lines and `@glion/lint-segment-header-length` reports each one. Before, an empty line was dropped without a trace (#1158). The message header is read after the empty lines before it: an empty line before `MSH` no longer stops MSH-1 and MSH-2 being read, which lost MSH-2 on output.

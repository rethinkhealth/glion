---
"@glion/parser": minor
"@glion/cli": patch
---

**Breaking:** an empty line is read as a segment with an empty Segment ID, no fields, and the terminator that ended it, so a message is written back with its empty lines. Before, an empty line was dropped without a trace (#1158). `@glion/lint-segment-header-length` reports each one at `error`, `@glion/lint-required-message-header` reports one before `MSH`, and `@glion/lint-profile-segment-order` reports each one the event schema has no place for: an `Hxx` segment of the event schema can take it. The message header is read after the empty lines before it: an empty line before `MSH` no longer stops MSH-1 and MSH-2 being read, which lost MSH-2 on output. An empty line after the last segment is a segment, so `@glion/lint-profile-segment-order` reports a segment missing at the end of the message next to that line, at its start or its end, rather than at the end of the message.

`glion send` sends each empty line of a message file as an empty segment, a carriage return alone, and counts it among the segments it reports.

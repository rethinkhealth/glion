---
"@glion/lint-required-message-header": patch
---

Report a message with no segments as `Message header (MSH) segment is required as the first segment — received an empty message instead`, and a first segment with an empty Segment ID as `… received a segment with an empty Segment ID instead` (it was `received '' instead`). The rule reports through `file.message`; its severity is the one it is configured with, as before.

---
"@glion/mllp-client": minor
"@glion/cli": patch
---

**Breaking:** `MllpClient.send()` writes the message with `toHl7v2`, each segment followed by its `terminator`, and changes nothing about it: a message read with `\n` or `\r\n` line breaks is sent with them. Apply `@glion/transform-segment-terminator` before sending to end every segment with `\r`.

`glion send` reads a message with `@glion/parser` and `@glion/transform-segment-terminator`, so each segment is sent ending with `\r`, whatever line breaks the file holds.

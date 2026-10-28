---
"@glion/mllp-client": patch
"@glion/cli": patch
---

A message is sent with a carriage return after every segment, whatever line breaks it was read with: `encode()` applies `@glion/transform-segment-terminator` before writing the message, and `glion send` counts the bytes of that message.

---
"@glion/parser": patch
---

Read every character of MSH-2 as it is written. An escape sequence after its fourth character, as in `MSH|^~\&\F\|`, was decoded, so the message changed on every round trip (#1100).

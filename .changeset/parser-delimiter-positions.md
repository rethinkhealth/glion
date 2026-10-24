---
"@glion/parser": patch
---

Position a field, repetition, or component whose text starts with a delimiter at that text. In `PID|^|`, the field covered 4–4 instead of `^` at 4–5, and its repetition lay outside it, so a lint finding on such a node pointed at the wrong range (#1102). The root now starts at the first character of the input, so `|` has a root at 0–1.

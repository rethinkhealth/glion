---
"@glion/transform-trim-trailing-fields": minor
---

Add `@glion/transform-trim-trailing-fields`, a transform that removes the empty fields at the end of each segment, so `PID|1|DOE||` is written as `PID|1|DOE`.

- Treat a field as empty when none of its components, repetitions, or subcomponents holds a value, as HL7v2 treats it as not present: a trailing `|^^|` or `|~|` is removed, and a trailing `|""|`, the null value, stays.
- Keep the field separator after a segment's last field with a value when `keepTrailingField` is `true`, so `PID|1|DOE||` is written as `PID|1|DOE|`.

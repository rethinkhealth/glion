---
"@glion/preset-lint-recommended": minor
---

`@glion/preset-lint-recommended` runs `@glion/lint-segment-terminator`, at its default severity, `warning`: a segment that ends with `\n` or `\r\n`, or a last segment with no segment terminator, is reported. A message is still accepted; the warning is not fatal.

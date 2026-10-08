---
"@glion/lint-profile-required-fields": patch
---

Report a required field that is not present apart from one that is empty, each as one sentence:

- `Field \`PID-3\` (Patient Identifier List) is not present; it is required.`
- `Field \`PID-3\` (Patient Identifier List) is empty; it is required.`

The empty case sets `actual` to `""`. The rule has a `url` to its README in this repository.

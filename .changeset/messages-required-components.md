---
"@glion/lint-profile-required-components": patch
---

Report a required component that is not present apart from one that is empty, each as one sentence:

- `Component \`MSH-9.3\` (Message Structure) is not present; it is required.`
- `Component \`MSH-9.3\` (Message Structure) is empty; it is required.`

The empty case sets `actual` to `""`. The rule has a `url` to its README in this repository.

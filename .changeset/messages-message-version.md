---
"@glion/lint-message-version": patch
---

Word every report as one sentence per cause, and report a missing `MSH-12` apart from an empty one:

- `The message has no \`MSH-12\` (Version ID); a message must declare its HL7v2 version.`
- `The version in \`MSH-12\` (Version ID) is empty; a message must declare its HL7v2 version.`
- `The version in \`MSH-12\` (Version ID) is \`foo\`; a version must be numbers separated by dots, such as \`2.5\` or \`2.5.1\`.`
- `The version in \`MSH-12\` (Version ID) is \`2.2\`; it must satisfy \`<3.0.0 >=2.3\`.`
- `The input is a segment; the version can be read only from \`MSH-12\` (Version ID) of a whole message.`

A report on a value sets `actual` to it; a version outside the range also sets `expected` to the configured expression. The rule's `url` points to its README in this repository.

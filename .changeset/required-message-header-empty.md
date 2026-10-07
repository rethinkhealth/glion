---
"@glion/lint-required-message-header": patch
---

Report a message with no segments, and word every report as one sentence per cause:

- `The first segment is \`PID\`; a message must start with the message header segment (\`MSH\`).`
- `The first segment has an empty Segment ID; a message must start with the message header segment (\`MSH\`).`
- `The message has no segments; it must start with the message header segment (\`MSH\`).` (previously not reported)

Each report sets `expected` to `['MSH']` and, when there is a first segment, `actual` to its Segment ID. The rule's `url` points to its README in this repository. The rule reports through `file.message`; its severity is the one it is configured with, as before.

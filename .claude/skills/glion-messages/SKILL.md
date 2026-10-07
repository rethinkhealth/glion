---
name: glion-messages
description: Write or audit user-facing message strings in the glion monorepo — lint findings reported through `file.message` and the `message` of thrown errors. Use whenever adding, editing, or reviewing such a string, including when the change is incidental to other work, and when a test asserts one.
---

# glion-messages

A message is **one complete sentence per cause**, written out in full, with its values also carried in structured fields. ADR 0026 (`docs/adr/0026-message-strings.md`) is the decision; this skill is the checklist.

## The rules

1. **One cause, one complete message.** If the wording differs between two situations, they are two causes with two messages. Never build a message from parts.
2. **Lint rules keep a catalog.** A `messages` constant at the top of the rule module, one entry per cause, named for the cause. A fixed message is a string; a message with values is an arrow function whose parameters name the values. The report site passes the entry to `file.message` and adds nothing to the text.
3. **Thrown errors** hold their message in their own class: one class (or one `code`) per cause, a fixed sentence, values on typed properties. ADR 0018 §6 decides what the sentence says (context, domain terms, a next step, no secrets).
4. **Form.** Sentence case, present tense, closing period. What was found first, then what HL7v2 requires, joined by a semicolon when they share a sentence. A fix or a reason goes in a second sentence or in `note`.
5. **HL7v2 vocabulary.** Segment ID, `PID-3`, `MSH-9.3`, the element's name where it helps (`PID-3 (Patient Identifier List)`). Never node, tree, token, array, index.
6. **Values.** Backticks around any value from the message, Segment ID, or delimiter. An empty or absent value is described in words and is its own cause: `an empty Segment ID`, `no segments` — never `''`.
7. **Fields.** For a lint finding that compares found against acceptable values, set `actual` (found) and `expected` (acceptable list) on the returned message. `note` for a longer explanation or a reference to the standard. `url` comes from `lintRule`'s `url` and points to the rule's README. Keep `place` and `ancestors`.
8. **Counts** go through `pluralize` inside the catalog entry.

## Banned

| Pattern                                                  | Example caught in review                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Shared prefix or suffix constant joined to a clause      | `` `${REQUIRED} — received ${x} instead` ``                        |
| A clause chosen by a ternary and spliced into a sentence | `const received = name === "" ? "a segment with…" : \`'${name}'\`` |
| Fragments joined with `—`                                | `"Connecting failed — check that the host is reachable"`           |
| Values in a trailing parenthetical                       | `exceeds max length of 20 (actual: 25)`                            |
| An empty value printed as quotes                         | `received '' instead`                                              |
| Implementation vocabulary                                | `Root node type must be 'root'`                                    |
| Blame or vague verdicts                                  | `bad value`, `illegal segment`, `invalid input` with no specifics  |
| The code restated in the prose                           | `SEGMENT_ORDER: …`                                                 |

## Shape

```ts
const messages = {
  emptyMessage:
    "The message has no segments; it must start with the message header segment (`MSH`).",
  emptySegmentId:
    "The first segment has an empty Segment ID; a message must start with the message header segment (`MSH`).",
  notMessageHeader: (segmentId: string) =>
    `The first segment is \`${segmentId}\`; a message must start with the message header segment (\`MSH\`).`,
} as const;

// at the report site
const message = file.message(messages.notMessageHeader(first.name), {
  ancestors: [first],
  place: first.position,
});
message.actual = first.name;
message.expected = ["MSH"];
```

## Before / after

```ts
// ✗ assembled
`${REQUIRED} — received '${first.name}' instead``Field ${segment.name}-${sequence} exceeds max length of ${max} (actual: ${length})`
// ✓ one sentence per cause, values also in fields
`The first segment is \`${segmentId}\`; a message must start with the message header segment (\`MSH\`).``Field \`${field}\` is ${pluralize("character", length, true)} long; HL7v2 allows at most ${max}.`;
```

## Tests

Assert the full message with `toBe`, never `toContain`, and assert `actual` and `expected` where the rule sets them. A wording change updates the catalog and its tests in the same commit.

## Self-check

- [ ] Every cause has its own complete message; no message is built from parts.
- [ ] A lint rule's messages are all in its `messages` catalog; the report site adds no text.
- [ ] Sentence case, present tense, closing period; found first, then the requirement.
- [ ] HL7v2 terms only; values in backticks; empty values described in words.
- [ ] `actual` and `expected` are set where the finding compares values; `url` points to the README.
- [ ] Tests assert the whole string.

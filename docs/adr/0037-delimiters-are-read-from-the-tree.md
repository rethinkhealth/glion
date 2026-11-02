# ADR 0037: Delimiters Are Read From the Tree

## Status

Proposed (2026-11-01). Supersedes the delimiters part of [ADR 0014](./0014-file-data-vs-node-data.md).

Answers #1170 and #1172.

## Context

HL7v2 v2.5.1 §2.5.4 defines a message's delimiters in its message header: "The delimiter values used in the MSH segment are the delimiter values used throughout the entire message." A message carries its own delimiters.

ADR 0014 stored them on `file.data.delimiters`, so that a built tree had them as well as a parsed one. That made a second copy of what MSH-1 and MSH-2 already say, and each reader chose between the copies in its own order. The two could disagree: after a transform changed MSH-2, the writer still used the delimiters the parser recorded, so the header said one thing and the body another. `delimiters()` also took the first segment named `MSH` anywhere in the tree, while the parser takes only a message header the message opens with, so a message that followed a batch header had different delimiters in each.

## Decision

After parsing, the tree's MSH-1 and MSH-2 are the only record of a message's delimiters.

| Stage         | Order                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| Reading text  | MSH-1 and MSH-2, filled by the `encodingCharacters` option; with no message header, `settings`, then `\|^~\\&` |
| After parsing | an explicit argument, then the tree's MSH-1 and MSH-2, then `settings`, then `\|^~\\&`                         |

- `delimiters()` follows the parser's rule for what a message header is: the first segment after any empty lines, named `MSH`, with fields.
- The parser's `encodingCharacters` option makes the tree truthful: what it fills is the value of MSH-2 in the tree. `MSH|^~&` with `{ subcomponent: "#" }` is written back as `MSH|^~&#`. MSH-2 is positional, so the option fills in order, up to the first delimiter it does not give. A fill that repeats another delimiter's character reaches MSH-2 like any other, the same as a sender's.
- Only the message header holds MSH-1 and MSH-2. An `MSH` later in a message is any other segment, for the parser, the writer, and the escapes plugins.
- Without an escape character, a value is written as it is unless it holds a separator or a line break.
- `file.data.delimiters` and `@glion/annotate-delimiters` are removed.

## Consequences

- The header and the body cannot disagree, and a transform changes a message's delimiters by editing MSH-2.
- Without the option, a message whose values hold no raw character below U+0020 is written back byte for byte, and so is any message without an escape character whose values hold no line feed read as data. With the option, the written MSH-2 differs from the one received, and declares what the body uses, so a receiver can read it.
- `lint-profile-*` rules read `delimiters(tree)` and do not see `settings`, because a lint rule has no processor. They report on annotated fields, which need the version in MSH-12, so a message without a message header does not reach them.
- A removed package must be deprecated on npm.

# ADR 0035: Segments Record Their Terminator

## Status

Proposed (2026-10-28)

Answers #1147. Amends decision 3 of ADR 0034.

## Context

ADR 0034 has the parser read `\r`, `\n`, and `\r\n` as segment ends without rewriting the text, and the serializer write `\r` after every segment. Two things were left open:

- **The tree did not say how a segment ended.** A lint rule that reports a segment ending with `\n` or `\r\n`, or a last segment with no terminator, had to read the file text at each segment's end. That works only while the positions point into that text and the file still holds it.
- **A line feed always ended a segment.** HL7v2 Chapter 2 makes the carriage return the only segment terminator, and TX states no character rule, so a raw line feed in a TX value of a conformant message is not ruled out by the text. A parser that reads `\n` as a segment end splits that segment, and no caller could ask it to read the strict form.

## Decision

1. **A segment records its terminator.** `Segment.terminator` holds the characters that ended the segment in the text it was read from: `\r`, `\n`, or `\r\n`. A last segment with nothing after it has `""`. An empty line is an empty segment, with an empty Segment ID, no fields, and the terminator that ended it (#1158). The message header is read after the empty lines before it.
2. **Every segment states its terminator.** `Segment.terminator` is required, so no reader has to guess what an absent one means, and none takes it for `\r`. A segment without one is a bug in what made the tree: `@glion/to-hl7v2` throws a `TypeError`, and `@glion/lint-segment-terminator` stops and records why.
3. **The builder ends a segment with `\r`.** `s()` sets `terminator` to `\r` and takes no argument for it. A caller sets the property on the returned node for another terminator.
4. **The serializer writes the tree.** `@glion/to-hl7v2` writes each segment followed by its `terminator`, so a parsed message is written back with the line breaks it was read with, a missing final terminator included. It adds nothing of its own. An empty `terminator` before another segment throws `SegmentTerminatorError`: written as it is, the two segments would be one, and HL7v2 has no way to write that tree.
5. **One transform repairs it, where the caller chooses.** `@glion/transform-segment-terminator` sets every segment's `terminator` to `\r`, in place. `@glion/mllp-client` sends the tree as `toHl7v2` writes it and changes nothing. `glion send`, which reads messages from files, reads them with the parser and this transform, so a message goes out over MLLP with the segment terminator HL7v2 requires, whatever line breaks the file holds. An empty line is an empty segment, so it is sent as one: `PID|1` + LF + LF goes out as `PID|1` + CR + CR.
6. **The parser reads `\n` and `\r\n` by default, and can be told not to.** `lineBreaks: false` ends a segment only at a carriage return, the segment terminator Chapter 2 requires, and a line feed is data.
7. **A lint rule reports the deviations from the tree.** `@glion/lint-segment-terminator` reads `segment.terminator`: `""`, `\n`, `\r\n`, and any other character than `\r` are reported. It is in `@glion/preset-lint-recommended` at its default severity, `warning`, so a message read from a file with `\n` or `\r\n` line breaks is reported and still accepted. An empty line is reported at `error` by `@glion/lint-segment-header-length`, so a receiver that runs the preset rejects a message that holds one.

## Consequences

- A parsed tree carries a `terminator` on every segment, and a built tree carries `\r` on every segment, so trees compared or snapshotted in tests gain the key.
- A message read without a final terminator, or with `\r\n` or `\n` line breaks, is written back as it was read. A pipeline that writes HL7v2 for a receiver applies `@glion/transform-segment-terminator` first; `glion send` does, and a caller of `MllpClient.send()` does it before sending.
- A segment made as an object literal states its `terminator`; TypeScript rejects one without it.
- A segment appended after a last segment read with nothing after it makes `toHl7v2` throw, until that segment's `terminator` is set or `@glion/transform-segment-terminator` is applied.

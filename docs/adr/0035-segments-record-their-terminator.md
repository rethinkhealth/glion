# ADR 0035: Segments Record Their Terminator

## Status

Proposed (2026-10-28)

Answers #1147. Amends decision 3 of ADR 0034.

## Context

ADR 0034 has the parser read `\r`, `\n`, and `\r\n` as segment ends without rewriting the text, and the serializer write `\r` after every segment. Two things were left open:

- **The tree did not say how a segment ended.** A lint rule that reports a segment ending with `\n` or `\r\n`, or a last segment with no terminator, had to read the file text at each segment's end. That works only while the positions point into that text and the file still holds it.
- **A line feed always ended a segment.** HL7v2 Chapter 2 makes the carriage return the only segment terminator, and TX states no character rule, so a raw line feed in a TX value of a conformant message is not ruled out by the text. A parser that reads `\n` as a segment end splits that segment, and no caller could ask it to read the strict form.

## Decision

1. **A segment records its terminator.** `Segment.terminator` holds the characters that ended the segment in the text it was read from: `\r`, `\n`, or `\r\n`. A last segment with nothing after it has `""`. An empty line after a segment is not recorded.
2. **Absent is the same as `""`.** A segment without a `terminator` has no segment terminator. No reader takes an absent `terminator` for `\r`: the serializer writes nothing after it when it is the last segment, and the lint rule reports it.
3. **The builder ends a segment with `\r`.** `s()` sets `terminator` to `\r` and takes no argument for it. A caller sets the property on the returned node for another terminator.
4. **The serializer writes the tree.** `@glion/to-hl7v2` writes each segment followed by its `terminator`, so a parsed message is written back with the line breaks it was read with, a missing final terminator included. An empty or absent `terminator` is written only after the last segment: after any other, `\r` is written, so a segment added after a parsed last segment does not join it.
5. **One transform repairs it.** `@glion/transform-segment-terminator` returns a copy of the tree in which every segment ends with `\r`. `@glion/mllp-client` applies it before sending, so a message goes out over MLLP with the segment terminator HL7v2 requires, whatever it was read with.
6. **The parser reads `\n` and `\r\n` by default, and can be told not to.** `lineBreaks: false` ends a segment only at a carriage return, the segment terminator Chapter 2 requires, and a line feed is data.
7. **A lint rule reports the deviations from the tree.** `@glion/lint-segment-terminator` reads `segment.terminator`: `""`, an absent `terminator`, `\n`, `\r\n`, and any other character than `\r` are reported. It is in no preset: a message saved to a file on most systems ends every line with `\n`.

## Consequences

- A parsed tree carries a `terminator` on every segment, and a built tree carries `\r` on every segment, so trees compared or snapshotted in tests gain the key.
- A message read without a final terminator, or with `\r\n` or `\n` line breaks, is written back as it was read. A pipeline that writes HL7v2 for a receiver applies `@glion/transform-segment-terminator` first; `@glion/mllp-client` and `glion send` do.
- `toHl7v2(tree, { segment })` sets only the delimiter written between a segment with no terminator and the next one.
- A segment made as an object literal, without `terminator`, has no segment terminator: `\r` is written after it only when another segment follows.

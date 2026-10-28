# ADR 0034: The Parser Reads the Text as Given

## Status

Proposed (2026-10-28)

Answers #1137 and #1139.

## Context

HL7v2 Chapter 2 ends every segment with a carriage return. Every version from v2.4 to v2.8.2 says so in the same words: "The segment terminator is always a carriage return (in ASCII, a hex 0D)." The message construction rules write it after every segment, the last one included (#1137).

Senders deviate in three ways: they end segments with a line feed (`\n`) or a carriage return and a line feed (`\r\n`), mostly in messages saved to files, and they leave out the terminator after the last segment.

Until now `@glion/parser` read these messages by rewriting them first. Its default preprocessing steps removed a leading byte order mark and replaced every `\r\n` and `\n` with `\r` before tokenizing, and the root ended at its last segment. Three things followed:

- **Positions pointed into text the caller never had.** After a `\r\n` or a byte order mark, every position was one character early per rewrite, so a lint finding in a CRLF file pointed at the wrong place (#1139).
- **The deviations left no trace.** A message with `\n`, with `\r\n`, or with no final terminator gave the same tree as a correct one, so no rule could report which senders deviate.
- **A pure parser was the other option, and it fails silently.** A parser that reads only `\r` reads `MSH|…\nPID|1` as one MSH segment whose last field holds `…\nPID|1`, without an error, unless every caller remembers to add a step that rewrites the line breaks, which brings back the wrong positions.

Reading `\n` as a segment end loses no valid message. Chapter 2A allows no raw line feed in a value in any version from v2.4 to v2.8.2: an ST value holds "displayable (printable) ASCII characters (hexadecimal values between 20 and 7E)", a TX value marks a line break with the repetition separator, and an FT value with `\.br\`.

## Decision

The parser reads the text it is given and never rewrites it. What it accepts beyond HL7v2 is part of its grammar, not a rewrite, and stays visible in the tree, so a lint rule can report it; the serializer writes the form HL7v2 requires.

1. **A segment ends at `\r`, `\n`, or `\r\n`.** The tokenizer reads all three as the end of a segment. A byte order mark at the start of the input is skipped where it is. The `stripBOM` and `normalizeNewlines` preprocessing steps are removed; `detectDelimiters` stays the one default step, and `preprocess` stays for callers who add their own.
2. **Every position is a span of the input as given.** A segment ends at its last character, before its line break. The root covers the message from its first character to its last, the line breaks after its last segment included. Whether a message ends with a segment terminator is the gap between the root's end and its last segment's end.
3. **A lint rule reports the deviations.** `@glion/lint-segment-terminator` reports a segment that ends with `\n` or `\r\n`, and a last segment with no segment terminator. It reads the line break from the file text at the segment's end. It is not in a preset: a message saved to a file on most systems ends every line with `\n`, so it would report every segment of every file.
4. **The serializer writes `\r` after every segment.** `@glion/to-hl7v2` ends every segment of a message with the segment terminator, the last one included, whatever line breaks the message was read with.

## Consequences

- A message's positions change when it holds `\r\n` or a byte order mark: they now point into its text.
- The root's position ends after the line breaks that follow the last segment. A finding placed at the end of the message, such as a segment missing at the end in `@glion/lint-profile-segment-order`, moves to the start of the line after the last segment, where the missing segment would go.
- A caller that passed `stripBOM` or `normalizeNewlines` in `preprocess` removes them; the parser does both without rewriting.
- A message written by `@glion/to-hl7v2` always ends with `\r`, so a message read without one and written back is one character longer.

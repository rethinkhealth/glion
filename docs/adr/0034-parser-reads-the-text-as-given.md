# ADR 0034: The Parser Reads the Text as Given

## Status

Proposed (2026-10-28)

Answers #1137 and #1139.

## Context

HL7v2 Chapter 2 ends every segment with a carriage return. Every version from v2.5.1 to v2.8.2 says so in the same words: "The segment terminator is always a carriage return (in ASCII, a hex 0D)." The message construction rules write it after every segment, the last one included (#1137).

Senders deviate in three ways: they end segments with a line feed (`\n`) or a carriage return and a line feed (`\r\n`), mostly in messages saved to files, and they leave out the terminator after the last segment.

Until now `@glion/parser` read these messages by rewriting them first. Its default preprocessing steps removed a leading byte order mark and replaced every `\r\n` and `\n` with `\r` before tokenizing, and the root ended at its last segment. Two things followed:

- **Positions pointed into text the caller never had.** After a `\r\n`, every position was one character early per rewrite, so a lint finding in a CRLF file pointed at the wrong place (#1139).
- **A pure parser was the other option, and it fails silently.** A parser that reads only `\r` reads `MSH|…\nPID|1` as one MSH segment whose last field holds `…\nPID|1`, without an error, unless every caller remembers to add a step that rewrites the line breaks, which brings back the wrong positions.

Reading `\n` as the end of a segment has a cost. Chapter 2 never mentions a line feed. ST allows only "displayable (printable) ASCII characters (hexadecimal values between 20 and 7E, inclusive …)", but TX states no character rule, and FT is derived from ST in v2.5.1 and from TX from v2.6. A raw line feed in a TX value is not ruled out by the text, and a parser that reads `\n` as a segment end splits that segment. The rewriting parser did the same.

## Decision

The parser reads the message it is given and never rewrites it.

1. **A segment ends at `\r`, `\n`, or `\r\n`.** The tokenizer reads all three as the end of a segment. A segment delimiter given in the settings ends a segment as well, and does not replace `\r`. The `normalizeNewlines` preprocessing step is removed; `stripBOM` and `detectDelimiters` stay the default steps, and `preprocess` stays for callers who add their own.
2. **Every position is a span of the message as given.** A byte order mark at the start of the input is not part of the message: `stripBOM` removes it, and positions count from the character after it. A segment ends at its last character, before its line break. The root covers the message from its first character to its last, the line breaks after its last segment included.
3. **The serializer writes `\r` after every segment.** `@glion/to-hl7v2` ends every segment of a message with the segment terminator, the last one included, whatever line breaks the message was read with.

Recording how each segment ended, a parser option to read `\r` alone, and a lint rule that reports the deviations are #1147.

## Consequences

- A message's positions change when it holds `\r\n`: they now point into its text.
- The root's position ends after the line breaks that follow the last segment. A finding placed at the end of the message, such as a segment missing at the end in `@glion/lint-profile-segment-order`, moves to the end of those line breaks: with one segment terminator after the last segment, the start of the next line, where the missing segment would go, and with none, the end of the last segment.
- A caller that passed `normalizeNewlines` in `preprocess` removes it; the parser reads line breaks without rewriting.
- A message written by `@glion/to-hl7v2` always ends with `\r`, so a message read without one and written back is one character longer.
- A raw line feed in a TX or FT value still ends the segment, as it did before.

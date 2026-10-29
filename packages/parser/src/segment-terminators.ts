// What ends a segment.
//
// HL7v2 ends every segment with the segment delimiter, a carriage return
// (Chapter 2: "The segment terminator is always a carriage return"). A message
// saved to a file often ends its segments with that file's line endings
// instead, a carriage return and a line feed or a line feed alone, so the
// parser reads those as segment terminators too. With the default delimiters:
//
//   `MSH|^~\&\rPID|1`    `\r` ends MSH
//   `MSH|^~\&\r\nPID|1`  `\r\n` ends MSH, read whole, not as `\r` and then `\n`
//   `MSH|^~\&\nPID|1`    `\n` ends MSH
//
// With another segment delimiter, such as `$`, a carriage return alone is
// data: `PID|a\rb$OBX|1` holds the value `a\rb`, and `$`, `\r\n`, and `\n`
// end a segment.

// The line endings of a text file: a carriage return and a line feed, or a
// line feed alone.
const CARRIAGE_RETURN = "\r";
const LINE_FEED = "\n";
const CARRIAGE_RETURN_LINE_FEED = `${CARRIAGE_RETURN}${LINE_FEED}`;

/**
 * The segment terminator that starts at `at` in `input` for the segment
 * delimiter `segment`, or `undefined` when none does: a carriage return and a
 * line feed, `segment`, or a line feed, tried in that order.
 */
export const segmentTerminatorAt = (
  input: string,
  at: number,
  segment: string
): string | undefined => {
  // The tokenizer asks at every character of every value, so this compares
  // characters, which is faster than a loop over the terminators or
  // `startsWith`.
  const char = input.charAt(at);
  if (char === CARRIAGE_RETURN && input.charAt(at + 1) === LINE_FEED) {
    return CARRIAGE_RETURN_LINE_FEED;
  }
  return char === segment || char === LINE_FEED ? char : undefined;
};

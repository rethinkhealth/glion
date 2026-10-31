// What ends a segment.
//
// HL7v2 ends every segment with a carriage return (Chapter 2: "The segment
// terminator is always a carriage return"). A message saved to a file often
// ends its segments with that file's line endings instead, a carriage return
// and a line feed or a line feed alone, so the parser reads those as segment
// terminators too:
//
//   `MSH|^~\&\rPID|1`    `\r` ends MSH
//   `MSH|^~\&\r\nPID|1`  `\r\n` ends MSH, read whole, not as `\r` and then `\n`
//   `MSH|^~\&\nPID|1`    `\n` ends MSH

import { SEGMENT_TERMINATOR as CARRIAGE_RETURN } from "@glion/utils";

const LINE_FEED = "\n";
const CARRIAGE_RETURN_LINE_FEED = `${CARRIAGE_RETURN}${LINE_FEED}`;

/**
 * The segment terminator that starts at `at` in `input`, or `undefined` when
 * none does: a carriage return and a line feed, a carriage return, or a line
 * feed.
 */
export const segmentTerminatorAt = (
  input: string,
  at: number
): string | undefined => {
  // The tokenizer asks at every character of every value, so this compares
  // characters, which is faster than a loop over the terminators or
  // `startsWith`.
  const char = input.charAt(at);
  if (char === CARRIAGE_RETURN) {
    return input.charAt(at + 1) === LINE_FEED
      ? CARRIAGE_RETURN_LINE_FEED
      : CARRIAGE_RETURN;
  }
  return char === LINE_FEED ? LINE_FEED : undefined;
};

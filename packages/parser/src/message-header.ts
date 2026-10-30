// The start of a message, read before the rest is tokenized.
//
// A message opens with the message header segment, whose first two fields
// declare the delimiters of the rest of the message. In `MSH|^~\&|APP`:
//
//   offsets 0–3  `MSH`   the Segment ID
//   offsets 3–4  `|`     MSH-1, the field separator: the character after `MSH`
//   offsets 4–8  `^~\&`  MSH-2, the encoding characters, in the order
//                        component, repetition, escape, subcomponent
//
// No delimiter opens MSH-1: it is whatever character follows `MSH`. MSH-2 holds
// up to four encoding characters, and ends at the next field delimiter or
// segment terminator: `MSH|^~\|APP` and `MSH|^~\` then `\r` both declare
// `^~\`. Empty lines before `MSH` are skipped: in `\rMSH|^~\&`, `MSH` is at
// offset 1.

import { segmentTerminatorAt } from "./segment-terminators";

const MAX_ENCODING_CHARACTERS = 4;

/** The Segment ID of the message header segment. */
export const MESSAGE_HEADER = "MSH";

/** Where a message header segment and its first two fields are. */
export interface MessageHeader {
  /** The offset `MSH` starts at, after the empty lines before it. */
  start: number;
  /** MSH-1: the character after `MSH`, or `""` when the input ends there. */
  fieldSeparator: string;
  /** The offset MSH-2 starts at, after MSH-1. */
  encodingCharactersStart: number;
}

/**
 * The message header segment the message opens with, after any empty lines,
 * or `undefined` when it opens with another segment, or with `MSH` and then a
 * segment terminator, which holds no fields.
 */
export const readMessageHeader = (
  input: string,
  lineBreaks: boolean
): MessageHeader | undefined => {
  let start = 0;
  let emptyLine = segmentTerminatorAt(input, start, lineBreaks);
  while (emptyLine !== undefined) {
    start += emptyLine.length;
    emptyLine = segmentTerminatorAt(input, start, lineBreaks);
  }
  const fieldSeparatorAt = start + MESSAGE_HEADER.length;
  const opensWithMessageHeader =
    input.startsWith(MESSAGE_HEADER, start) &&
    segmentTerminatorAt(input, fieldSeparatorAt, lineBreaks) === undefined;
  if (!opensWithMessageHeader) {
    return undefined;
  }
  return {
    encodingCharactersStart: fieldSeparatorAt + 1,
    fieldSeparator: input.charAt(fieldSeparatorAt),
    start,
  };
};

/**
 * The encoding characters MSH-2 holds: its characters up to the fourth, the
 * field delimiter `field`, a segment terminator, or the end of `input`,
 * whichever comes first.
 */
export const readEncodingCharacters = (
  input: string,
  header: MessageHeader,
  field: string,
  lineBreaks: boolean
): string => {
  const from = header.encodingCharactersStart;
  const limit = Math.min(from + MAX_ENCODING_CHARACTERS, input.length);
  let end = from;
  while (
    end < limit &&
    input.charAt(end) !== field &&
    segmentTerminatorAt(input, end, lineBreaks) === undefined
  ) {
    end += 1;
  }
  return input.slice(from, end);
};

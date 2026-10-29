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
// `^~\`. A byte order mark before `MSH` is not part of the message, so
// `\uFEFFMSH|^~\&` opens at offset 1.

import { segmentTerminatorAt } from "./segment-terminators";

const BYTE_ORDER_MARK = "\uFEFF";
const MAX_ENCODING_CHARACTERS = 4;

/** The Segment ID of the message header segment. */
export const MESSAGE_HEADER = "MSH";

/** Where a message header segment's first two fields are. */
export interface MessageHeader {
  /** MSH-1: the character after `MSH`, or `""` when the input ends there. */
  fieldSeparator: string;
  /** The offset MSH-2 starts at, after MSH-1. */
  encodingCharactersStart: number;
}

/**
 * The offset the message starts at in `input`: 1 after a byte order mark, and
 * 0 otherwise.
 */
export const messageStart = (input: string): number =>
  input.startsWith(BYTE_ORDER_MARK) ? 1 : 0;

/**
 * The message header segment the message opens with, or `undefined` when it
 * opens with another segment, or with `MSH` and then a segment terminator for
 * the segment delimiter `segment`, which holds no fields.
 */
export const readMessageHeader = (
  input: string,
  segment: string
): MessageHeader | undefined => {
  const start = messageStart(input);
  const fieldSeparatorAt = start + MESSAGE_HEADER.length;
  const opensWithMessageHeader =
    input.startsWith(MESSAGE_HEADER, start) &&
    segmentTerminatorAt(input, fieldSeparatorAt, segment) === undefined;
  if (!opensWithMessageHeader) {
    return undefined;
  }
  return {
    encodingCharactersStart: fieldSeparatorAt + 1,
    fieldSeparator: input.charAt(fieldSeparatorAt),
  };
};

/**
 * The encoding characters MSH-2 holds: its characters up to the fourth, the
 * field delimiter `field`, a segment terminator for the segment delimiter
 * `segment`, or the end of `input`, whichever comes first.
 */
export const readEncodingCharacters = (
  input: string,
  header: MessageHeader,
  { field, segment }: { field: string; segment: string }
): string => {
  const from = header.encodingCharactersStart;
  const limit = Math.min(from + MAX_ENCODING_CHARACTERS, input.length);
  let end = from;
  while (
    end < limit &&
    input.charAt(end) !== field &&
    segmentTerminatorAt(input, end, segment) === undefined
  ) {
    end += 1;
  }
  return input.slice(from, end);
};

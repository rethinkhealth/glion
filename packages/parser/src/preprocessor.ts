import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "@glion/utils";

import { readEncodingCharacters, readMessageHeader } from "./message-header";
import type { ParserContext, PreprocessorStep } from "./types";

const BYTE_ORDER_MARK = "\uFEFF";

/**
 * Removes a byte order mark from the start of the input. A byte order mark is
 * not part of the message, so every position counts from the character after
 * it.
 */
export const stripBOM: PreprocessorStep = (ctx) => {
  if (ctx.input.startsWith(BYTE_ORDER_MARK)) {
    ctx.input = ctx.input.slice(BYTE_ORDER_MARK.length);
  }
  return ctx;
};

/**
 * Sets the delimiters the message header declares.
 *
 * MSH-1 sets the field delimiter, and MSH-2's encoding characters set the
 * component, repetition, escape, and subcomponent delimiters, in that order.
 * A delimiter MSH-2 is too short to declare is the default. The segment
 * delimiter, which the message header does not declare, stays the one the
 * context gives. A message that does not open with a message header segment
 * keeps the delimiters it was given.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  // The header is read with the segment delimiter the context gives:
  // `MSH|^~\` then `\r` declares `^~\`.
  const { segment } = ctx.delimiters;
  const header = readMessageHeader(ctx.input, segment);
  if (!header) {
    return ctx;
  }
  // MSH-2 ends at the field delimiter MSH-1 declares.
  const encodingCharacters = readEncodingCharacters(ctx.input, header, {
    field: header.fieldSeparator,
    segment,
  });
  ctx.delimiters = {
    component: encodingCharacters.charAt(0) || DEFAULT_DELIMITERS.component,
    escape: encodingCharacters.charAt(2) || DEFAULT_DELIMITERS.escape,
    field: header.fieldSeparator || DEFAULT_DELIMITERS.field,
    repetition: encodingCharacters.charAt(1) || DEFAULT_DELIMITERS.repetition,
    segment,
    subcomponent:
      encodingCharacters.charAt(3) || DEFAULT_DELIMITERS.subcomponent,
  };
  return ctx;
};

/** The preprocessing steps `parseHL7v2` runs when `preprocess` is not given. */
export const defaultPreprocessors: PreprocessorStep[] = [
  stripBOM,
  detectDelimiters,
];

/**
 * Runs `steps` in order, each on the context the step before returned, and
 * returns the context the last one returned.
 */
export function runPreprocessors(
  ctx: ParserContext,
  steps: PreprocessorStep[]
): ParserContext {
  for (const step of steps) {
    // oxlint-disable-next-line no-param-reassign
    ctx = step(ctx);
  }

  return ctx;
}

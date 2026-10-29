import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "@glion/utils";

import { readEncodingCharacters, readMessageHeader } from "./message-header";
import type { ParserContext, PreprocessorStep } from "./types";

/**
 * Sets the delimiters the message header declares.
 *
 * MSH-1 sets the field delimiter, and MSH-2's encoding characters set the
 * component, repetition, escape, and subcomponent delimiters, in that order.
 * A delimiter MSH-2 is too short to declare, and the segment delimiter, which
 * the message header does not declare, are the defaults. A message that does
 * not open with a message header segment keeps the delimiters it was given.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  // The segment delimiter is not declared, so the header is read with the
  // default one: `MSH|^~\` then `\r` declares `^~\`.
  const { segment } = DEFAULT_DELIMITERS;
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
export const defaultPreprocessors: PreprocessorStep[] = [detectDelimiters];

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

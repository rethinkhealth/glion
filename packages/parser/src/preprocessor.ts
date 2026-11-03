import type { Delimiters } from "@glion/ast";
import { DEFAULT_DELIMITERS, ENCODING_CHARACTERS } from "@glion/utils";

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
 * MSH-1 sets the field separator, and MSH-2's encoding characters set the
 * component separator, repetition separator, escape character, and subcomponent
 * separator, in that order. A delimiter MSH-2 is too short to declare is
 * absent: `^~&` declares no subcomponent separator. A message that does not
 * open with a message header segment keeps the delimiters it was given.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  const lineBreaks = ctx.lineBreaks ?? true;
  const header = readMessageHeader(ctx.input, lineBreaks);
  if (!header) {
    return ctx;
  }
  // MSH-2 ends at the field separator MSH-1 declares: `MSH|^~\|APP` and
  // `MSH|^~\` then `\r` both declare `^~\`.
  const encodingCharacters = readEncodingCharacters(
    ctx.input,
    header,
    header.fieldSeparator,
    lineBreaks
  );
  const delimiters: Delimiters = {
    field: header.fieldSeparator || DEFAULT_DELIMITERS.field,
  };
  for (const [i, delimiter] of ENCODING_CHARACTERS.entries()) {
    const ch = encodingCharacters.charAt(i);
    if (ch !== "") {
      delimiters[delimiter] = ch;
    }
  }
  ctx.delimiters = delimiters;
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

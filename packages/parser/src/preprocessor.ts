import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "@glion/utils";

import {
  encodingCharactersEnd,
  lineBreakAt,
  messageStart,
  MSH_FIELD_DELIMITER_START,
  MSH_FIELD_SEPERATOR_START,
} from "./tokenizer";
import type { ParserContext, PreprocessorStep } from "./types";

// PreprocessorStep is declared in `types.ts` to avoid circular imports

/**
 * Step: auto-detect delimiters from MSH.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  const start = messageStart(ctx.input);
  const { segment } = DEFAULT_DELIMITERS;
  // MSH followed by a line break declares no delimiters.
  const declaresDelimiters =
    ctx.input.startsWith("MSH", start) &&
    !lineBreakAt(ctx.input, start + MSH_FIELD_SEPERATOR_START, segment);
  if (declaresDelimiters) {
    const field =
      ctx.input.charAt(start + MSH_FIELD_SEPERATOR_START) ||
      DEFAULT_DELIMITERS.field;
    const msh2Start = start + MSH_FIELD_DELIMITER_START;
    const enc = ctx.input.slice(
      msh2Start,
      encodingCharactersEnd(ctx.input, msh2Start, { field, segment })
    );
    const component = enc.charAt(0) || DEFAULT_DELIMITERS.component;
    const repetition = enc.charAt(1) || DEFAULT_DELIMITERS.repetition;
    const _escape = enc.charAt(2) || DEFAULT_DELIMITERS.escape;
    const subcomponent = enc.charAt(3) || DEFAULT_DELIMITERS.subcomponent;

    ctx.delimiters = {
      component,
      escape: _escape,
      field,
      repetition,
      subcomponent,
    };
  }
  return ctx;
};

/**
 * Default preprocessing pipeline.
 */
export const defaultPreprocessors: PreprocessorStep[] = [detectDelimiters];

/**
 * Run the pipeline to initialize ParserContext.
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

import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "@glion/utils";

import { messageStart } from "./tokenizer";
import type { ParserContext, PreprocessorStep } from "./types";

// PreprocessorStep is declared in `types.ts` to avoid circular imports

/**
 * Step: auto-detect delimiters from MSH.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  const start = messageStart(ctx.input);
  if (ctx.input.startsWith("MSH", start)) {
    const field = ctx.input.charAt(start + 3) || DEFAULT_DELIMITERS.field;
    const enc = ctx.input.slice(start + 4, start + 8);
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

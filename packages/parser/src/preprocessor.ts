import { DEFAULT_DELIMITERS, SEGMENT_TERMINATOR } from "@glion/utils";

import type { ParserContext, PreprocessorStep } from "./types";

// PreprocessorStep is declared in `types.ts` to avoid circular imports

/**
 * Step: strip UTF-8 BOM.
 */
export const stripBOM: PreprocessorStep = (ctx) => {
  if (ctx.input.codePointAt(0) === 0xfe_ff) {
    ctx.input = ctx.input.slice(1);
  }
  return ctx;
};

/**
 * Step: normalize newlines to the segment terminator.
 */
export const normalizeNewlines: PreprocessorStep = (ctx) => {
  ctx.input = ctx.input.replaceAll(/\r?\n/g, SEGMENT_TERMINATOR);
  return ctx;
};

/**
 * Step: auto-detect delimiters from MSH.
 */
export const detectDelimiters: PreprocessorStep = (ctx) => {
  if (ctx.input.startsWith("MSH")) {
    const field = ctx.input.charAt(3) || DEFAULT_DELIMITERS.field;
    const enc = ctx.input.slice(4, 8);
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
export const defaultPreprocessors: PreprocessorStep[] = [
  stripBOM,
  normalizeNewlines,
  detectDelimiters,
];

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

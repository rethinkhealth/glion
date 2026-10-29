// The reference delimiter detection: `detectDelimiters` as it was written
// before `src/preprocessor.ts` was refactored, kept as a second implementation
// of the same rules. `src/preprocessor.ts` must detect the delimiters this one
// detects, for every input and every set of delimiters, and
// `../preprocessor.test.ts` checks it. A change to what the parser reads is
// made in both.
import { DEFAULT_DELIMITERS } from "@glion/utils";

import type { PreprocessorStep } from "../../../src/types";
import {
  encodingCharactersEnd,
  lineBreakAt,
  messageStart,
  MSH_FIELD_DELIMITER_START,
  MSH_FIELD_SEPERATOR_START,
} from "./tokenizer";

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
      segment,
      subcomponent,
    };
  }
  return ctx;
};

import type { Root } from "@glion/ast";
import type { HL7v2Settings } from "@glion/config";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import type { Plugin, Processor } from "unified";

import { defaultPreprocessors, runPreprocessors } from "./preprocessor";
import { parseHL7v2FromIterator } from "./processor";
import { HL7v2Tokenizer } from "./tokenizer";
import type { ParseOptions, ParserContext } from "./types";

// Reads a message in four steps:
//
//   1. The context: the input as given, and the delimiters from the defaults
//      and the settings.
//   2. The preprocessing steps (`preprocessor.ts`). By default, `stripBOM`
//      removes a byte order mark from the start of the input, and
//      `detectDelimiters` sets the delimiters the message header declares.
//   3. The tokenizer, which reads the input into delimiters, segment
//      terminators, and text (`tokenizer.ts`).
//   4. The processor, which builds the tree from the tokens (`processor.ts`).
//
// No step rewrites the message, so every position is a span of the text as it
// was given, counted from the character after a byte order mark.

/**
 * Reads `input` into a tree.
 *
 * @throws {TypeError} When `input` is not a string.
 */
export function parseHL7v2(
  input: string,
  opts: ParseOptions = {},
  settings?: HL7v2Settings
): Root {
  // A caller that reads a file without an encoding passes a `Buffer`, which
  // the type does not stop at runtime.
  if (typeof input !== "string") {
    throw new TypeError(
      "`input` is not a string; `parseHL7v2` reads a message from a string."
    );
  }
  const context: ParserContext = {
    delimiters: {
      ...DEFAULT_DELIMITERS,
      ...settings?.delimiters,
    },
    input,
  };
  const preprocessed = runPreprocessors(
    context,
    opts.preprocess ?? defaultPreprocessors
  );
  const tokenizer = new HL7v2Tokenizer({ decodeEscapes: opts.decodeEscapes });
  tokenizer.reset(preprocessed);
  return parseHL7v2FromIterator(tokenizer);
}

const hl7v2Parser: Plugin<[ParseOptions?], string, Root> = function hl7v2Parser(
  this: Processor,
  options = {}
) {
  this.parser = (document: string) => {
    // Get settings from processor (populated by unified-args from config)
    const settings = this.data("settings");

    return parseHL7v2(document, options, settings);
  };
};

export default hl7v2Parser;

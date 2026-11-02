import type { Delimiters, Root } from "@glion/ast";
import type { HL7v2Settings } from "@glion/config";
import { DEFAULT_DELIMITERS, ENCODING_CHARACTERS } from "@glion/utils";
import type { Plugin, Processor } from "unified";

import { defaultPreprocessors, runPreprocessors } from "./preprocessor";
import { parseHL7v2FromIterator } from "./processor";
import { HL7v2Tokenizer } from "./tokenizer";
import type { EncodingCharacters, ParseOptions, ParserContext } from "./types";

// Reads a message in five steps:
//
//   1. The context: the input as given, and the delimiters from the defaults
//      and the settings.
//   2. The preprocessing steps (`preprocessor.ts`). By default, `stripBOM`
//      removes a byte order mark from the start of the input, and
//      `detectDelimiters` sets the delimiters the message header declares.
//   3. The encoding characters option, which fills what MSH-2 leaves out, in
//      order: `MSH|^~&` with `{ subcomponent: "#" }` has the escape character
//      `&` and the subcomponent separator `#`, and MSH-2 reads `^~&#`. `MSH|^`
//      with the same option fills nothing, because MSH-2 is positional.
//   4. The tokenizer, which reads the input into delimiters, segment
//      terminators, and text (`tokenizer.ts`).
//   5. The processor, which builds the tree from the tokens (`processor.ts`).
//
// No step rewrites the input, so every position is a span of the text as it
// was given, counted from the character after a byte order mark.

/**
 * @throws {TypeError} When a delimiter of `encodingCharacters` is not one
 *   character, or is a line break.
 */
const assertEncodingCharacters = (
  encodingCharacters: EncodingCharacters
): void => {
  for (const delimiter of ENCODING_CHARACTERS) {
    const ch: unknown = encodingCharacters[delimiter];
    if (ch !== undefined && (typeof ch !== "string" || ch.length !== 1)) {
      throw new TypeError(
        `\`encodingCharacters.${delimiter}\` is not one character; a delimiter is one character.`
      );
    }
    if (ch === "\r" || ch === "\n") {
      throw new TypeError(
        `\`encodingCharacters.${delimiter}\` is a line break; a line break ends a segment, and is not a delimiter.`
      );
    }
  }
};

/**
 * The encoding characters `fill` gives where `declared` has none, in the order
 * MSH-2 declares them, up to the first it does not give.
 */
const filledEncodingCharacters = (
  declared: Delimiters,
  fill: EncodingCharacters
): EncodingCharacters => {
  const filled: EncodingCharacters = {};
  for (const delimiter of ENCODING_CHARACTERS) {
    if (declared[delimiter] === undefined) {
      const ch = fill[delimiter];
      if (ch === undefined) {
        break;
      }
      filled[delimiter] = ch;
    }
  }
  return filled;
};

/**
 * Reads `input` into a tree.
 *
 * @throws {TypeError} When `input` is not a string, or a delimiter of
 *   `opts.encodingCharacters` is not one character or is a line break.
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
  const fill = opts.encodingCharacters ?? {};
  assertEncodingCharacters(fill);
  const context: ParserContext = {
    delimiters: {
      ...DEFAULT_DELIMITERS,
      ...settings?.delimiters,
    },
    input,
    lineBreaks: opts.lineBreaks,
  };
  const preprocessed = runPreprocessors(
    context,
    opts.preprocess ?? defaultPreprocessors
  );
  const filled = filledEncodingCharacters(preprocessed.delimiters, fill);
  const delimiters = { ...preprocessed.delimiters, ...filled };
  const tokenizer = new HL7v2Tokenizer({ decodeEscapes: opts.decodeEscapes });
  tokenizer.reset({
    ...preprocessed,
    delimiters,
    encodingCharacters:
      Object.keys(filled).length > 0
        ? ENCODING_CHARACTERS.map((delimiter) => delimiters[delimiter]).join("")
        : undefined,
  });
  return parseHL7v2FromIterator(tokenizer);
}

/**
 * Reads a message into a tree.
 *
 * Reads the delimiters for a message without a message header segment from the
 * processor's `settings`.
 */
const hl7v2Parser: Plugin<[ParseOptions?], string, Root> = function hl7v2Parser(
  this: Processor,
  options = {}
) {
  this.parser = (document) =>
    parseHL7v2(document, options, this.data("settings"));
};

export default hl7v2Parser;

import type { Delimiters } from "@glion/ast";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { HL7v2Tokenizer } from "../../src/tokenizer";
import type { Token } from "../../src/types";
import { arbDelimiters, arbText } from "./arbitraries";
import { HL7v2Tokenizer as ReferenceTokenizer } from "./reference/tokenizer";

const tokens = (
  tokenizer: HL7v2Tokenizer | ReferenceTokenizer,
  input: string,
  delimiters: Delimiters
): Token[] => {
  tokenizer.reset({ delimiters, input });
  return [...tokenizer];
};

describe("the tokenizer and the reference tokenizer", () => {
  // The tokenizer emits the tokens the reference tokenizer emits, with the
  // same values and positions, for any text, any delimiters, and escape
  // sequences decoded or not.
  //
  // Mutant: a segment terminator does not start a segment, so a Segment ID
  // that starts with a delimiter is read as delimiters. Fails on
  // `"MSH\nPID|^A\r^B|1"`.
  it("emits the tokens the reference tokenizer emits", () => {
    fc.assert(
      fc.property(
        arbText,
        arbDelimiters,
        fc.boolean(),
        (input, delimiters, decodeEscapes) => {
          expect(
            tokens(new HL7v2Tokenizer({ decodeEscapes }), input, delimiters)
          ).toStrictEqual(
            tokens(new ReferenceTokenizer({ decodeEscapes }), input, delimiters)
          );
        }
      ),
      {
        examples: [
          ["MSH", DEFAULT_DELIMITERS, true],
          ["\uFEFFMSH|^~\\&|A\\F\\\r\nPID|1", DEFAULT_DELIMITERS, true],
          ["MSH|^~\\\r\nPID|1\r", DEFAULT_DELIMITERS, true],
          ["MSH|^~\\&#\\F\\|A\\F\\", DEFAULT_DELIMITERS, true],
          ["MSH\nPID|^A\r^B|1", DEFAULT_DELIMITERS, true],
          [
            "PI\rD\r\nOBX|a\rb$C",
            { ...DEFAULT_DELIMITERS, segment: "$" },
            false,
          ],
        ],
        numRuns: 1000,
      }
    );
  });
});

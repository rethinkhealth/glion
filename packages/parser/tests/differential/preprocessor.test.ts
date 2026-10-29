import { DEFAULT_DELIMITERS } from "@glion/utils";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { detectDelimiters } from "../../src/preprocessor";
import { arbDelimiters, arbText } from "./arbitraries";
import { detectDelimiters as referenceDetectDelimiters } from "./reference/preprocessor";

describe("delimiter detection and the reference delimiter detection", () => {
  // Delimiter detection gives the delimiters the reference gives, for any
  // text and any delimiters it starts from.
  //
  // Mutant: the encoding characters end at the fourth character only, not at
  // a line break before it. Fails on `"MSH|^\r"`.
  it("detects the delimiters the reference detects", () => {
    fc.assert(
      fc.property(arbText, arbDelimiters, (input, delimiters) => {
        expect(detectDelimiters({ delimiters, input })).toStrictEqual(
          referenceDetectDelimiters({ delimiters, input })
        );
      }),
      {
        examples: [
          ["MSH", DEFAULT_DELIMITERS],
          ["\uFEFFMSH*%$#&", DEFAULT_DELIMITERS],
          ["MSH*%$\r\nPID", DEFAULT_DELIMITERS],
          ["MSH*%*APP", DEFAULT_DELIMITERS],
          ["MSH\nPID*1", DEFAULT_DELIMITERS],
        ],
        numRuns: 20_000,
      }
    );
  });
});

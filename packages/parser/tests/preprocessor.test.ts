import { DEFAULT_DELIMITERS } from "@glion/utils";
import fc from "fast-check";

import {
  defaultPreprocessors,
  detectDelimiters,
  runPreprocessors,
  stripBOM,
} from "../src/preprocessor";
import type { ParserContext, PreprocessorStep } from "../src/types";

describe(runPreprocessors, () => {
  it("removes a byte order mark, keeps the line breaks, and detects the delimiters by default", () => {
    const ctx = runPreprocessors(
      { delimiters: DEFAULT_DELIMITERS, input: "\uFEFFMSH*%$#&\r\nPID*1" },
      defaultPreprocessors
    );

    expect(ctx.input).toBe("MSH*%$#&\r\nPID*1");
    expect(ctx.delimiters.field).toBe("*");
  });

  it("respects custom step arrays", () => {
    const customProcessor: PreprocessorStep = (context) => {
      context.input = context.input.replace("ABC", "DEF");
      return context;
    };

    const ctx = runPreprocessors(
      {
        delimiters: DEFAULT_DELIMITERS,
        input: "ABC\nXYZ",
      },
      [customProcessor]
    );
    expect(ctx.input).toBe("DEF\nXYZ");
  });
});

describe("preprocessor steps", () => {
  describe(stripBOM, () => {
    it("removes a byte order mark from the start of the input", () => {
      expect(
        stripBOM({ delimiters: DEFAULT_DELIMITERS, input: "\uFEFFMSH|^~\\&" })
          .input
      ).toBe("MSH|^~\\&");
    });

    it("removes one byte order mark only, and keeps a second, which is data", () => {
      expect(
        stripBOM({
          delimiters: DEFAULT_DELIMITERS,
          input: "\uFEFF\uFEFFMSH|^~\\&",
        }).input
      ).toBe("\uFEFFMSH|^~\\&");
    });

    it("keeps a byte order mark after the start of the input, which is data", () => {
      expect(
        stripBOM({ delimiters: DEFAULT_DELIMITERS, input: "PID|\uFEFF" }).input
      ).toBe("PID|\uFEFF");
    });
  });

  describe(detectDelimiters, () => {
    it("detects delimiters from MSH-1 and MSH-2", () => {
      // MSH-1: '*', MSH-2: %$#& etc.
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH*%$#&",
        metadata: {},
      };
      const result = detectDelimiters(ctx);
      expect(result.delimiters?.field).toBe("*");
      expect(result.delimiters?.component).toBe("%");
      expect(result.delimiters?.repetition).toBe("$");
      expect(result.delimiters?.escape).toBe("#");
      expect(result.delimiters?.subcomponent).toBe("&");
    });

    it("ends MSH-2 at a segment terminator before its fourth character", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH*%$\rPID*1",
      });

      expect(result.delimiters).toStrictEqual({
        component: "%",
        escape: "\\",
        field: "*",
        repetition: "$",
        subcomponent: "&",
      });
    });

    it("reads the encoding characters up to a line break before the fourth", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH*%$#\r\nPID*1",
      });

      expect(result.delimiters).toStrictEqual({
        component: "%",
        escape: "#",
        field: "*",
        repetition: "$",
        subcomponent: "&",
      });
    });

    it("reads the encoding characters up to a field delimiter before the fourth", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH*%$*APP",
      });

      expect(result.delimiters).toStrictEqual({
        component: "%",
        escape: "\\",
        field: "*",
        repetition: "$",
        subcomponent: "&",
      });
    });

    it("does not change delimiters when a line break follows MSH", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH\nPID*1",
      });

      expect(result.delimiters).toBe(DEFAULT_DELIMITERS);
    });

    it("reads a line feed after MSH as the field separator when line breaks are off", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH\n^~\\&\nPID\n1\r",
        lineBreaks: false,
      });

      expect(result.delimiters.field).toBe("\n");
    });

    it("reads the encoding characters past a line feed when line breaks are off", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH*%$\n#*APP\r",
        lineBreaks: false,
      });

      expect(result.delimiters.escape).toBe("\n");
    });

    it("does not change delimiters when another segment comes before MSH", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "PID|123",
        metadata: {},
      };
      const result = detectDelimiters(ctx);
      expect(result.delimiters).toBe(DEFAULT_DELIMITERS);
    });

    // MSH-1 sets the field delimiter, and each of MSH-2's encoding characters
    // sets the delimiter of its role, up to the first field delimiter or
    // segment terminator. A role MSH-2 is too short to declare keeps the
    // default.
    //
    // Mutant: `readEncodingCharacters` does not stop at a segment terminator.
    // Fails on `"MSH|\r\n"`, which declares `\r` and `\n` as the component
    // and repetition delimiters.
    it("sets the delimiters MSH-1 and MSH-2 declare, and the default for each role MSH-2 is too short to declare", () => {
      // Five distinct characters for MSH-1 and the four encoding characters,
      // none of them a segment terminator.
      const arbDeclared = fc.uniqueArray(fc.constantFrom(..."|^~\\&*%#!@+="), {
        maxLength: 5,
        minLength: 5,
      });

      fc.assert(
        fc.property(
          arbDeclared,
          fc.integer({ max: 4, min: 0 }),
          // What follows MSH-2: nothing, a segment terminator, or MSH-3.
          fc.constantFrom("", "\r", "\n", "\r\n", "<field>APP"),
          ([field, ...encoding], length, after) => {
            const declared = encoding.slice(0, length);
            const ctx = {
              delimiters: DEFAULT_DELIMITERS,
              input: `MSH${field}${declared.join("")}${after.replace("<field>", field)}`,
            };

            expect(detectDelimiters(ctx).delimiters).toStrictEqual({
              component: declared[0] ?? DEFAULT_DELIMITERS.component,
              escape: declared[2] ?? DEFAULT_DELIMITERS.escape,
              field,
              repetition: declared[1] ?? DEFAULT_DELIMITERS.repetition,
              subcomponent: declared[3] ?? DEFAULT_DELIMITERS.subcomponent,
            });
          }
        ),
        {
          examples: [
            [["|", "^", "~", "\\", "&"], 4, "\r"],
            [["|", "^", "~", "\\", "&"], 2, "\r\n"],
            [["*", "%", "#", "!", "@"], 3, "<field>APP"],
          ],
          numRuns: 1000,
        }
      );
    });
  });
});

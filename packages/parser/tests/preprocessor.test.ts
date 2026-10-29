import { DEFAULT_DELIMITERS } from "@glion/utils";

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

    // The message header does not declare the segment delimiter.
    it("keeps the segment delimiter the context gives, and reads the header with it", () => {
      const result = detectDelimiters({
        delimiters: { ...DEFAULT_DELIMITERS, segment: "$" },
        input: "MSH|^~\\$PID|1",
      });

      expect(result.delimiters).toStrictEqual({
        component: "^",
        escape: "\\",
        field: "|",
        repetition: "~",
        segment: "$",
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
        segment: "\r",
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
        segment: "\r",
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

    it("does not change delimiters if input does not start with MSH", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "PID|123",
        metadata: {},
      };
      const result = detectDelimiters(ctx);
      expect(result.delimiters).toBe(DEFAULT_DELIMITERS);
    });
  });
});

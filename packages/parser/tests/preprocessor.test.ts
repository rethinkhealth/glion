import { DEFAULT_DELIMITERS } from "@glion/utils";

import {
  defaultPreprocessors,
  detectDelimiters,
  runPreprocessors,
} from "../src/preprocessor";
import type { ParserContext, PreprocessorStep } from "../src/types";

describe(runPreprocessors, () => {
  it("leaves the input as it is and detects the delimiters by default", () => {
    const input = "\uFEFFMSH*%$#&\r\nPID*1";

    const ctx = runPreprocessors(
      { delimiters: DEFAULT_DELIMITERS, input },
      defaultPreprocessors
    );

    expect(ctx.input).toBe(input);
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

    it("detects delimiters from MSH after a byte order mark", () => {
      const result = detectDelimiters({
        delimiters: DEFAULT_DELIMITERS,
        input: "\uFEFFMSH*%$#&",
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

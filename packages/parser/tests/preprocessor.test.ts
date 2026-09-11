import { DEFAULT_DELIMITERS } from "@glion/utils";

import {
  defaultPreprocessors,
  detectDelimiters,
  normalizeNewlines,
  runPreprocessors,
  stripBOM,
} from "../src/preprocessor";
import type { ParserContext, PreprocessorStep } from "../src/types";

describe(runPreprocessors, () => {
  it("runs default preprocessors (stripBOM + normalizeNewlines + detectDelimiters)", () => {
    const bomChar = "\uFEFF";
    const msg = "MSH|^~\\&\nPID|123";
    const raw = bomChar + msg;

    const ctx = runPreprocessors(
      {
        delimiters: DEFAULT_DELIMITERS,
        input: raw,
      },
      defaultPreprocessors
    );
    expect(ctx.input).toBe("MSH|^~\\&\rPID|123");
    expect(ctx.delimiters).toBeDefined();
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
    it("removes UTF-8 BOM at start of input", () => {
      const bomChar = "\uFEFF";
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: `${bomChar}MSH|^~\\&`,
        metadata: {},
      };
      const result = stripBOM(ctx);
      expect(result.input).toBe("MSH|^~\\&");
    });

    it("leaves input unchanged if no BOM", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH|^~\\&",
        metadata: {},
      };
      const result = stripBOM(ctx);
      expect(result.input).toBe("MSH|^~\\&");
    });

    it("leaves input unchanged if BOM is not at start", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "ABC\uFEFFMSH|^~\\&",
        metadata: {},
      };
      const result = stripBOM(ctx);
      expect(result.input).toBe("ABC\uFEFFMSH|^~\\&");
    });
  });

  describe(normalizeNewlines, () => {
    it("converts LF to CR", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH|A\nPID|B",
        metadata: {},
      };
      const result = normalizeNewlines(ctx);
      expect(result.input).toBe("MSH|A\rPID|B");
    });

    it("converts CRLF to CR", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH|A\r\nPID|B",
        metadata: {},
      };
      const result = normalizeNewlines(ctx);
      expect(result.input).toBe("MSH|A\rPID|B");
    });

    it("leaves CR untouched", () => {
      const ctx: ParserContext = {
        delimiters: DEFAULT_DELIMITERS,
        input: "MSH|A\rPID|B",
        metadata: {},
      };
      const result = normalizeNewlines(ctx);
      expect(result.input).toBe("MSH|A\rPID|B");
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

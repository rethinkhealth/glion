import type { Segment } from "@glion/ast";
import { f, g, m, s } from "@glion/builder";
import { hl7v2Parser, parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintDelimitersDuplicate from "../src";

/** Parses `text` and runs the rule on it, as a lint pipeline does. */
const lint = async (text: string, severity?: ["error"]) => {
  const processor = unified()
    .use(hl7v2Parser)
    .use(hl7v2LintDelimitersDuplicate, severity);
  const file = new VFile(text);
  await processor.run(processor.parse(file), file);
  return file.messages;
};

const reasons = async (text: string) => {
  const messages = await lint(text);
  return messages.map((message) => message.reason);
};

const NOTE =
  "HL7v2 gives each delimiter its own character, so that a value is told apart from the delimiters around it and from its escape sequences.";

describe("hl7v2-lint:delimiters-duplicate", () => {
  describe("a message header segment whose delimiters are distinct", () => {
    it("is not reported", async () => {
      expect(await lint("MSH|^~\\&|APP\rPID|1\r")).toStrictEqual([]);
      expect(await lint("MSH*%$#@*APP\rPID*1\r")).toStrictEqual([]);
    });

    it("is not reported when MSH-2 leaves out a delimiter", async () => {
      expect(await lint("MSH|^~&|APP\rPID|1\r")).toStrictEqual([]);
      expect(await lint("MSH||APP\rPID|1\r")).toStrictEqual([]);
    });
  });

  describe("a message that does not open with a message header segment", () => {
    it("is not reported", async () => {
      expect(await lint("PID|1\r")).toStrictEqual([]);
      expect(await lint("PID|1\rMSH|^^^^|APP\r")).toStrictEqual([]);
    });

    it("reads only the message header segment the message opens with", async () => {
      expect(await lint("MSH|^~\\&|APP\rMSH|^^^^|APP\r")).toStrictEqual([]);
    });
  });

  describe("a message header segment that is the first segment, but not the first child", () => {
    it("is reported after an empty line", async () => {
      expect(await reasons("\rMSH|^^~\\|APP\r")).toStrictEqual([
        "The repetition separator is the same character as the component separator.",
      ]);
    });

    it("is reported inside a segment group", async () => {
      const tree = m(g("HEADER", s("MSH", f("|"), f("^^~\\"))));
      const file = new VFile();
      await unified().use(hl7v2LintDelimitersDuplicate).run(tree, file);

      expect(file.messages.map((message) => message.reason)).toStrictEqual([
        "The repetition separator is the same character as the component separator.",
      ]);
    });
  });

  describe("delimiters that are the same character", () => {
    it("reports MSH-2 for a delimiter that repeats an earlier one's character, with that character", async () => {
      const text = "MSH|^~\\~|APP\r";
      const tree = parseHL7v2(text);
      const msh = tree.children[0] as Segment;
      const [message, ...rest] = await lint(text);

      expect(rest).toStrictEqual([]);
      expect(message?.message).toBe(
        "The subcomponent separator is the same character as the repetition separator."
      );
      expect(message?.place).toStrictEqual(msh.children[1]?.position);
      expect(message?.ancestors).toStrictEqual([tree, msh, msh.children[1]]);
      expect(message?.actual).toBe("~");
      expect(message?.note).toBe(NOTE);
      expect(message?.ruleId).toBe("delimiters-duplicate");
      expect(message?.source).toBe("hl7v2-lint");
    });

    it("reports each delimiter once, against the first delimiter with its character", async () => {
      expect(await reasons("MSH|^~^^|APP\r")).toStrictEqual([
        "The escape character is the same character as the component separator.",
        "The subcomponent separator is the same character as the component separator.",
      ]);
    });

    it("reports an encoding character that is the field separator", async () => {
      const tree = m(s("MSH", f("^"), f("^~\\&")));
      const file = new VFile();
      await unified().use(hl7v2LintDelimitersDuplicate).run(tree, file);

      expect(file.messages.map((message) => message.reason)).toStrictEqual([
        "The component separator is the same character as the field separator.",
      ]);
    });

    it("marks the finding fatal at `error`", async () => {
      const [message] = await lint("MSH|^~&&|APP\r", ["error"]);

      expect(message?.fatal).toBe(true);
    });
  });
});

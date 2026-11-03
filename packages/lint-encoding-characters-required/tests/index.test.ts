import type { Segment } from "@glion/ast";
import { f, g, m, s } from "@glion/builder";
import { hl7v2Parser, parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintEncodingCharactersRequired from "../src";

/** Parses `text` and runs the rule on it, as a lint pipeline does. */
const lint = async (text: string) => {
  const processor = unified()
    .use(hl7v2Parser)
    .use(hl7v2LintEncodingCharactersRequired);
  const file = new VFile(text);
  await processor.run(processor.parse(file), file);
  return file.messages;
};

const reasons = async (text: string) => {
  const messages = await lint(text);
  return messages.map((message) => message.reason);
};

const NOTE =
  "HL7v2 declares the component separator, the repetition separator, the escape character, and the subcomponent separator, in that order, as the encoding characters of the message header segment.";

describe("hl7v2-lint:encoding-characters-required", () => {
  describe("a message header segment that declares four encoding characters", () => {
    it("is not reported", async () => {
      expect(await lint("MSH|^~\\&|APP\rPID|1\r")).toStrictEqual([]);
      expect(await lint("MSH*%$#@*APP\rPID*1\r")).toStrictEqual([]);
    });

    it("is not reported when MSH-2 also declares the truncation character", async () => {
      expect(await lint("MSH|^~\\&#|APP\rPID|1\r")).toStrictEqual([]);
    });

    it("is not reported when two of them are the same character", async () => {
      expect(await lint("MSH|^~&&|APP\rPID|1\r")).toStrictEqual([]);
    });
  });

  describe("a message that does not open with a message header segment", () => {
    it("is not reported", async () => {
      expect(await lint("PID|1\r")).toStrictEqual([]);
      expect(await lint("PID|1\rMSH|^|APP\r")).toStrictEqual([]);
      expect(await lint("PID|1\rMSH\r")).toStrictEqual([]);
    });

    it("reads only the message header segment the message opens with", async () => {
      expect(await lint("MSH|^~\\&|APP\rMSH|^|APP\r")).toStrictEqual([]);
    });
  });

  describe("a message header segment that is the first segment, but not the first child", () => {
    it("is reported after an empty line", async () => {
      expect(await reasons("\rMSH|^~\\|APP\r")).toStrictEqual([
        "The encoding characters declare no subcomponent separator.",
      ]);
    });

    it("is reported inside a segment group", async () => {
      const tree = m(g("HEADER", s("MSH", f("|"), f("^~\\"))));
      const file = new VFile();
      await unified().use(hl7v2LintEncodingCharactersRequired).run(tree, file);

      expect(file.messages.map((message) => message.reason)).toStrictEqual([
        "The encoding characters declare no subcomponent separator.",
      ]);
    });
  });

  describe("encoding characters that leave out a delimiter", () => {
    it("reports MSH-2 for the subcomponent separator `^~&` leaves out", async () => {
      const text = "MSH|^~&|APP\rPID|1\r";
      const tree = parseHL7v2(text);
      const msh = tree.children[0] as Segment;
      const [message, ...rest] = await lint(text);

      expect(rest).toStrictEqual([]);
      expect(message?.message).toBe(
        "The encoding characters declare no subcomponent separator."
      );
      expect(message?.place).toStrictEqual(msh.children[1]?.position);
      expect(message?.ancestors).toStrictEqual([tree, msh, msh.children[1]]);
      expect(message?.note).toBe(NOTE);
      expect(message?.ruleId).toBe("encoding-characters-required");
      expect(message?.source).toBe("hl7v2-lint");
      expect(message?.fatal).toBe(false);
    });

    it("reports each delimiter MSH-2 leaves out, in the order MSH-2 declares them", async () => {
      expect(await reasons("MSH|^|APP\r")).toStrictEqual([
        "The encoding characters declare no repetition separator.",
        "The encoding characters declare no escape character.",
        "The encoding characters declare no subcomponent separator.",
      ]);
      expect(await reasons("MSH||APP\r")).toStrictEqual([
        "The encoding characters declare no component separator.",
        "The encoding characters declare no repetition separator.",
        "The encoding characters declare no escape character.",
        "The encoding characters declare no subcomponent separator.",
      ]);
    });

    it("reports every delimiter of a message header segment with no fields", async () => {
      expect(await reasons("MSH\rPID|1\r")).toStrictEqual([
        "The encoding characters declare no component separator.",
        "The encoding characters declare no repetition separator.",
        "The encoding characters declare no escape character.",
        "The encoding characters declare no subcomponent separator.",
      ]);
    });

    it("reports the message header segment when it has no MSH-2", async () => {
      const tree = m(s("MSH", f("|")));
      const msh = tree.children[0] as Segment;
      const file = new VFile();
      await unified().use(hl7v2LintEncodingCharactersRequired).run(tree, file);

      expect(file.messages).toHaveLength(4);
      expect(file.messages[0]?.ancestors).toStrictEqual([tree, msh]);
    });
  });
});

import type { Group, Root, Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { hl7v2Parser, parseHL7v2 } from "@glion/parser";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentTerminator from "../src";

/** Parses `text` and runs the rule on it, as a lint pipeline does. */
const lintFile = async (text: string): Promise<VFile> => {
  const processor = unified().use(hl7v2Parser).use(hl7v2LintSegmentTerminator);
  const file = new VFile(text);
  await processor.run(processor.parse(file), file);
  return file;
};

const lint = async (text: string) => {
  const file = await lintFile(text);
  return file.messages;
};

const NOTE =
  "HL7v2 ends every segment with a carriage return, the last one included.";

describe("hl7v2-lint:segment-terminator", () => {
  describe("a segment that ends with a carriage return", () => {
    it("is not reported, the last segment included", async () => {
      expect(await lint("MSH|^~\\&\rPID|1\r")).toStrictEqual([]);
    });

    it("is not reported when an empty line follows it", async () => {
      expect(await lint("MSH|^~\\&\rPID|1\r\r")).toStrictEqual([]);
    });
  });

  describe("a last segment without a segment terminator", () => {
    it("is reported at the end of the segment", async () => {
      const text = "MSH|^~\\&\rPID|1";
      const file = await lintFile(text);
      const tree = parseHL7v2(text);
      const [message, ...rest] = file.messages;

      expect(rest).toStrictEqual([]);
      expect(message?.message).toBe("The segment has no segment terminator.");
      expect(message?.place).toStrictEqual({
        column: 6,
        line: 2,
        offset: 14,
      });
      expect(message?.ancestors).toStrictEqual([tree, tree.children[1]]);
      expect(message?.actual).toBeUndefined();
      expect(message?.expected).toStrictEqual(["\r"]);
      expect(message?.note).toBe(NOTE);
      expect(message?.ruleId).toBe("segment-terminator");
      expect(message?.source).toBe("hl7v2-lint");
      expect(message?.fatal).toBe(false);
    });
  });

  describe("a segment that ends with a line feed", () => {
    it("is reported on its line break", async () => {
      const [message, ...rest] = await lint("MSH|^~\\&\nPID|1\r");

      expect(rest).toStrictEqual([]);
      expect(message?.message).toBe("The segment ends with a line feed.");
      expect(message?.place).toStrictEqual({
        end: { column: 1, line: 2, offset: 9 },
        start: { column: 9, line: 1, offset: 8 },
      });
      expect(message?.actual).toBe("\n");
      expect(message?.expected).toStrictEqual(["\r"]);
      expect(message?.note).toBe(NOTE);
    });
  });

  describe("a segment that ends with a carriage return and a line feed", () => {
    it("is reported on its line break", async () => {
      const [message, ...rest] = await lint("MSH|^~\\&\r\nPID|1\r");

      expect(rest).toStrictEqual([]);
      expect(message?.message).toBe(
        "The segment ends with a carriage return and a line feed."
      );
      expect(message?.place).toStrictEqual({
        end: { column: 1, line: 2, offset: 10 },
        start: { column: 9, line: 1, offset: 8 },
      });
      expect(message?.actual).toBe("\r\n");
      expect(message?.expected).toStrictEqual(["\r"]);
      expect(message?.note).toBe(NOTE);
    });
  });

  describe("a message with several line breaks", () => {
    it("reports each segment that does not end with a carriage return, in order", async () => {
      const messages = await lint("MSH|^~\\&\r\nPID|1\rPV1|1\nOBX|1");

      expect(messages.map((message) => message.message)).toStrictEqual([
        "The segment ends with a carriage return and a line feed.",
        "The segment ends with a line feed.",
        "The segment has no segment terminator.",
      ]);
    });
  });

  describe("a segment in a segment group", () => {
    it("is reported with the group among its ancestors", async () => {
      const text = "MSH|^~\\&\rPID|1";
      const tree = parseHL7v2(text);
      const [msh, pid] = tree.children as Segment[];
      const group: Group = {
        children: [pid as Segment],
        id: "PATIENT",
        name: "Patient",
        type: "group",
      };
      const grouped: Root = { ...tree, children: [msh as Segment, group] };
      const file = new VFile(text);

      await unified().use(hl7v2LintSegmentTerminator).run(grouped, file);

      expect(file.messages[0]?.ancestors).toStrictEqual([grouped, group, pid]);
    });
  });

  describe("a segment the rule cannot check", () => {
    it("is not reported when the file holds no text", async () => {
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentTerminator)
        .run(parseHL7v2("MSH|^~\\&\rPID|1"), file);

      expect(file.messages).toStrictEqual([]);
    });

    it("is not reported when it has no position", async () => {
      const file = new VFile("MSH|^~\\&\rPID|1");

      await unified()
        .use(hl7v2LintSegmentTerminator)
        .run(m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1"))), file);

      expect(file.messages).toStrictEqual([]);
    });

    it("is not reported when it ends with a segment delimiter set in the parser settings", async () => {
      const text = "PID|1$OBX|2$";
      const file = new VFile(text);
      const tree = parseHL7v2(
        text,
        {},
        { delimiters: { ...DEFAULT_DELIMITERS, segment: "$" } }
      );

      await unified().use(hl7v2LintSegmentTerminator).run(tree, file);

      expect(tree.children).toHaveLength(2);
      expect(file.messages).toStrictEqual([]);
    });
  });
});

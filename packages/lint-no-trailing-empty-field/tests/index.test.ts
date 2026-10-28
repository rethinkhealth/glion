import type { Segment } from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2LintNoTrailingEmptyField from "../src";

describe("hl7v2-lint:no-trailing-empty-field", () => {
  describe("pASSING CASES", () => {
    it("does not warn for a segment with no fields", async () => {
      const tree = m(s("MSH"));
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("does not warn for a segment with no trailing empty fields", async () => {
      const tree = m(s("MSH", f("|"), f("^~\\&"), f("2.5")));
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("does not warn for a segment with an end field with components", async () => {
      const tree = m(
        s(
          "OBR",
          f("1"),
          f("845439^GHH OE"),
          f("1045813^GHH LAB"),
          f("1554-5^GLUCOSE^LN"),
          f(c("", "", "", "", "", "R"))
        )
      );
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("does not warn for a trailing field that holds the HL7v2 null value", async () => {
      const tree = m(s("PID", f("1"), f('""')));
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("does not warn for a segment that ends with one empty field", async () => {
      const tree = m(s("PID", f("1"), f("DOE"), f()));
      const file = new VFile();

      await unified().use(hl7v2LintNoTrailingEmptyField).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("does not warn for a segment whose only field is empty", async () => {
      const tree = m(s("PID", f()));
      const file = new VFile();

      await unified().use(hl7v2LintNoTrailingEmptyField).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });
  });

  describe("nON-PASSING CASES", () => {
    it("warns for a trailing field whose components hold no value", async () => {
      const tree = m(
        s(
          "OBR",
          f("1"),
          f(""),
          f("200202150930"),
          f(""),
          f(""),
          f(c("", "", "", "", ""))
        )
      );
      const file = new VFile();

      await unified().use(hl7v2LintNoTrailingEmptyField).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 3 trailing field separators.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("warns for a trailing field whose repetitions hold no value", async () => {
      const tree = m(s("OBR", f("1"), f(""), f(r(""), r(c("", "")))));
      const file = new VFile();

      await unified().use(hl7v2LintNoTrailingEmptyField).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 2 trailing field separators.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("warns for a segment that ends with one empty field when strict", async () => {
      const tree = m(s("PID", f("1"), f("DOE"), f()));
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 1 trailing field separator.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("warns for a segment that ends with two empty fields", async () => {
      const tree = m(s("PID", f("1"), f("DOE"), f(), f()));
      const file = new VFile();

      await unified().use(hl7v2LintNoTrailingEmptyField).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 2 trailing field separators.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("reports a segment with an empty Segment ID with the same message", async () => {
      const tree = m(s("", f("1"), f("")));
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 1 trailing field separator.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("warns for a segment with trailing empty fields", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f("SENDER"),
          f("FAC"),
          f("RCVR"),
          f("FAC"),
          f("20250101010101"),
          f(""),
          f("ADT^A01"),
          f("MSG00001"),
          f("P"),
          f("2.5"),
          f("") // trailing empty field
        )
      );
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 1 trailing field separator.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("warns for a segment with multiple trailing empty fields", async () => {
      const tree = m(
        s(
          "PID",
          f("1"),
          f("John"),
          f(""), // trailing empty field
          f(""), // trailing empty field
          f("") // trailing empty field
        )
      );
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 3 trailing field separators.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
    });

    it("reports a range from the first trailing empty field to the end of the segment", async () => {
      const file = new VFile("MSH|^~\\&|A\rPID|1|DOE|||\rPV1|1\r");
      const processor = unified()
        .use(hl7v2Parser)
        .use(hl7v2LintNoTrailingEmptyField);
      const tree = processor.parse(file);
      await processor.run(tree, file);
      const pid = tree.children[1] as Segment;

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 3 trailing field separators.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
      expect(file.messages[0]?.place).toStrictEqual({
        end: { column: 13, line: 2, offset: 23 },
        start: { column: 11, line: 2, offset: 21 },
      });
      expect(file.messages[0]?.ancestors).toStrictEqual([tree, pid]);
    });

    it("reports a segment without a position with no range", async () => {
      const trailing = f("");
      trailing.position = {
        end: { column: 7, line: 1, offset: 6 },
        start: { column: 7, line: 1, offset: 6 },
      };
      const tree = m(s("PID", f("1"), trailing));
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 1 trailing field separator.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
      expect(file.messages[0]?.place).toBeUndefined();
    });

    it("reports a trailing empty field without a position on the whole segment", async () => {
      const segment = s("PID", f("1"), f(""));
      segment.position = {
        end: { column: 7, line: 1, offset: 6 },
        start: { column: 1, line: 1, offset: 0 },
      };
      const tree = m(segment);
      const file = new VFile();

      await unified()
        .use(hl7v2LintNoTrailingEmptyField, { strict: true })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "The segment has 1 trailing field separator.",
        note: "HL7v2 does not require field separators after the last field with a value.",
        ruleId: "no-trailing-empty-field",
        source: "hl7v2-lint",
      });
      expect(file.messages[0]?.place).toStrictEqual(segment.position);
    });
  });
});

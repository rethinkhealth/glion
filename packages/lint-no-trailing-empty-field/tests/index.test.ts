import type { Segment } from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
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

    it("warns for trailing field with all-empty components", async () => {
      // Per HL7v2 spec, |^^^^| is semantically empty — no non-whitespace values
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

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages.length).toBeGreaterThanOrEqual(1);
    });

    it("warns for trailing field with all-empty components (short segment)", async () => {
      const tree = m(s("OBR", f(""), f(""), f(c("", "", "", "", ""))));
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages.length).toBeGreaterThanOrEqual(1);
    });

    it("warns for trailing field with empty repetitions", async () => {
      const tree = m(s("OBR", f(""), f(""), f(r(""), r(c("", "")))));
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("nON-PASSING CASES", () => {
    it("names an empty Segment ID in the report", async () => {
      const tree = m(s("", f("1"), f("")));
      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.message).toBe(
        "A segment with an empty Segment ID ends with 1 empty field; a segment should end at its last field with a value."
      );
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

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.message).toBe(
        "Segment `MSH` ends with 1 empty field; a segment should end at its last field with a value."
      );
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
      expect(file.messages[0]?.message).toBe(
        "Segment `PID` ends with 3 empty fields; a segment should end at its last field with a value."
      );
    });

    it("reports a range covering all trailing empty fields", async () => {
      const tree = m(
        s(
          "PID",
          f("1"),
          f("DOE"),
          f(""), // first trailing field
          f("") // second trailing field
        )
      );

      const seg = tree.children[0] as Segment;
      const fields = seg.children;

      const point = (offset: number) => ({
        column: offset + 1,
        line: 1,
        offset,
      });

      seg.position = {
        end: point(50),
        start: point(0), // intentionally beyond the final field to expose the bug
      };

      // oxlint-disable-next-line typescript/no-non-null-assertion
      fields[0]!.position = { end: point(5), start: point(4) };
      // oxlint-disable-next-line typescript/no-non-null-assertion
      fields[1]!.position = { end: point(9), start: point(6) };
      // oxlint-disable-next-line typescript/no-non-null-assertion
      fields[2]!.position = { end: point(10), start: point(10) };
      // oxlint-disable-next-line typescript/no-non-null-assertion
      fields[3]!.position = { end: point(11), start: point(11) };

      const file = new VFile();

      await unified().use([hl7v2LintNoTrailingEmptyField]).run(tree, file);

      expect(file.messages).toHaveLength(1);

      // End position should be +1 to include the field separator (offset 11 + 1 = 12)
      expect(file.messages[0]?.place).toStrictEqual({
        end: {
          column: 13,
          line: 1,
          offset: 12,
        },
        start: fields[2]?.position?.start,
      });
    });
  });
});

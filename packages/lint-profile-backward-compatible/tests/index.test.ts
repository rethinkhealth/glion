import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Root, Segment } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { select } from "@glion/util-query";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintBackwardCompatible from "../src";

/** The HL7v2 text of the message `segments` make. */
const hl7 = (...segments: Segment[]) => toHl7v2(m(...segments));

/**
 * An MSH segment declaring `version` in MSH-12; the rule checks the message
 * against that version.
 */
const msh = (version: string) =>
  // MSH|^~\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01^ADT_A01|MSG001|P|<version>
  s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(),
    f("ADT", "A01", "ADT_A01"),
    f("MSG001"),
    f("P"),
    f(version)
  );

/**
 * The findings of the rule on a message of `segments`, written as HL7v2 text
 * and parsed, after the annotators it needs have put each element's optionality
 * on the tree.
 */
const lint = (...segments: Segment[]) => run(parseHL7v2(hl7(...segments)));

/**
 * The findings of the rule on `tree`, after the annotators it needs have put
 * each element's optionality on the tree.
 */
const run = async (tree: Root) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2AnnotateProfileDatatypes)
    .use(hl7v2LintBackwardCompatible)
    .run(tree, file);
  return file.messages;
};

// HL7v2 marks an element `B` when it keeps it only so older systems can still
// send it; another element now carries its data. A value is still allowed,
// so the rule's finding is a warning in the preset. The explicit null `""` is
// not a value.
describe("hl7v2LintBackwardCompatible", () => {
  describe("backward-compatible fields", () => {
    // The full finding: its text, the value found (`actual`), the values HL7v2
    // prefers (`expected`: empty, or the explicit null), and which rule made it.
    it("reports a backward-compatible field that has a value", async () => {
      // v2.5.1 DG1-4 (Diagnosis Description) is backward compatible
      const [message, ...rest] = await lint(
        msh("2.5.1"),
        // DG1|1|I9|250.00|DIABETES
        s("DG1", f("1"), f("I9"), f("250.00"), f("DIABETES"))
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The data element has a value; v2.5.1 keeps it only for backward compatibility."
      );
      expect(message?.actual).toBe("DIABETES");
      expect(message?.expected).toEqual(["", '""']);
      expect(message?.ruleId).toBe("backward-compatible");
      expect(message?.source).toBe("hl7v2-lint");
    });

    it("reports the field as HL7v2 text, with its escape sequences", async () => {
      const [message] = await lint(
        msh("2.5.1"),
        // DG1|1|I9|250.00|DIA\F\BETES
        s("DG1", f("1"), f("I9"), f("250.00"), f("DIA|BETES"))
      );

      expect(message?.actual).toBe("DIA\\F\\BETES");
    });

    // MSH-1 `X` and MSH-2 `E~\&`: the escape character in DG1-4 is written
    // `\E\` or `\X5C\`, and both hold a delimiter.
    it("reports the field without its text when the delimiters cannot write it", async () => {
      // The message is given as text: its value holds an escape character
      // that no escape sequence can write with these delimiters, so
      // `toHl7v2` throws `EscapeSequenceError` on it.
      const [message, ...rest] = await run(
        parseHL7v2(
          "MSHXE~\\&XSNDXFACXRCVXRFACX20241201XXADTEA01EADT_A01XMSG001XPX2.5.1\rDG1X1XI9X250.00XDIAB\\TS\r"
        )
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The data element has a value; v2.5.1 keeps it only for backward compatibility."
      );
      expect(message?.actual).toBeUndefined();
    });

    // `|` after DG1-3 leaves DG1-4 present but empty.
    it("accepts an empty backward-compatible field", async () => {
      expect(
        await lint(
          msh("2.5.1"),
          // DG1|1|I9|250.00|
          s("DG1", f("1"), f("I9"), f("250.00"), f())
        )
      ).toEqual([]);
    });

    // `""` is HL7v2's explicit null: "delete this value", not a value.
    it("accepts the explicit null in a backward-compatible field", async () => {
      expect(
        await lint(
          msh("2.5.1"),
          // DG1|1|I9|250.00|""
          s("DG1", f("1"), f("I9"), f("250.00"), f('""'))
        )
      ).toEqual([]);
    });

    // An element's status changes between versions; the rule reads the one of
    // the version in MSH-12.
    it("reports a field by its optionality in the message's version", async () => {
      // DG1-2 (Diagnosis Coding Method) is backward compatible in v2.3 and required in v2.5.1
      const inV23 = await lint(
        msh("2.3"),
        // DG1|1|I9|250.00
        s("DG1", f("1"), f("I9"), f("250.00"))
      );
      const inV251 = await lint(
        msh("2.5.1"),
        // DG1|1|I9|250.00
        s("DG1", f("1"), f("I9"), f("250.00"))
      );

      expect(inV23.map((message) => message.message)).toEqual([
        "The data element has a value; v2.3 keeps it only for backward compatibility.",
      ]);
      expect(inV251).toEqual([]);
    });
  });

  // Components and subcomponents carry an optionality from their datatype's
  // component table, so the same rule covers them.
  describe("backward-compatible components and subcomponents", () => {
    // `MD` is the sixth component of PID-5 (XPN), XPN.6.
    it("reports a backward-compatible component that has a value", async () => {
      // v2.6 XPN.6 (Degree) is backward compatible
      const messages = await lint(
        msh("2.6"),
        // PID|1||12345||DOE^JOHN^^^^MD
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f("DOE", "JOHN", "", "", "", "MD")
        )
      );

      expect(
        messages.map((message) => [message.message, message.actual])
      ).toEqual([
        [
          "The data element has a value; v2.6 keeps it only for backward compatibility.",
          "MD",
        ],
      ]);
    });

    // PID-11 (XAD) has `20240101&D` in its 13th component, XAD.13, a TS. `D` is
    // its second subcomponent, TS.2. The report names it `TS.2`.
    it("reports a backward-compatible subcomponent that has a value", async () => {
      // v2.5.1 XAD.13 (Effective Date) is a TS, whose TS.2 (Degree of Precision) is backward compatible
      const messages = await lint(
        msh("2.5.1"),
        // PID|1||12345||DOE^JOHN||||||1 MAIN ST^^^^^^^^^^^^20240101&D
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f("DOE", "JOHN"),
          f(),
          f(),
          f(),
          f(),
          f(),
          f(
            "1 MAIN ST",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            c("20240101", "D")
          )
        )
      );

      expect(
        messages.map((message) => [message.message, message.actual])
      ).toEqual([
        [
          "The data element has a value; v2.5.1 keeps it only for backward compatibility.",
          "D",
        ],
      ]);
    });
  });

  // A finding points at the element that has the value, so an editor can
  // underline it.
  describe("location", () => {
    it("points a finding on a field at the field", async () => {
      // v2.5.1 DG1-4 (Diagnosis Description) is backward compatible
      const [message] = await lint(
        msh("2.5.1"),
        // DG1|1|I9|250.00|DIABETES
        s("DG1", f("1"), f("I9"), f("250.00"), f("DIABETES"))
      );

      expect(message?.place).toStrictEqual({
        end: { column: 25, line: 2, offset: 95 },
        start: { column: 17, line: 2, offset: 87 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
        "root",
        "segment",
        "field",
      ]);
    });

    it("points a finding on a component at the component", async () => {
      // v2.6 XPN.6 (Degree) is backward compatible
      const [message] = await lint(
        msh("2.6"),
        // PID|1||12345||DOE^JOHN^^^^MD
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f("DOE", "JOHN", "", "", "", "MD")
        )
      );

      expect(message?.place).toStrictEqual({
        end: { column: 29, line: 2, offset: 97 },
        start: { column: 27, line: 2, offset: 95 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
        "root",
        "segment",
        "field",
        "field-repetition",
        "component",
      ]);
    });

    it("points a finding on a subcomponent at the subcomponent", async () => {
      // v2.5.1 XAD.13 (Effective Date) is a TS, whose TS.2 (Degree of Precision) is backward compatible
      const [message] = await lint(
        msh("2.5.1"),
        // PID|1||12345||DOE^JOHN||||||1 MAIN ST^^^^^^^^^^^^20240101&D
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f("DOE", "JOHN"),
          f(),
          f(),
          f(),
          f(),
          f(),
          f(
            "1 MAIN ST",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            c("20240101", "D")
          )
        )
      );

      expect(message?.place).toStrictEqual({
        end: { column: 60, line: 2, offset: 130 },
        start: { column: 59, line: 2, offset: 129 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
        "root",
        "segment",
        "field",
        "field-repetition",
        "component",
        "subcomponent",
      ]);
    });
  });

  // One report per backward-compatible element: the components of a
  // reported element are not reported again.
  it("reports a backward-compatible field once when one of its components is backward compatible too", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.5.1"),
        // ZPD|1|A^B
        s("ZPD", f("1"), f("A", "B"))
      )
    );
    const field = select(tree, "ZPD.2");
    const component = select(tree, "ZPD.2.2");
    if (field && component) {
      field.node.data = { id: "ZPD-2", name: "Site Code", optionality: "B" };
      component.node.data = { id: "CWE.2", name: "Text", optionality: "B" };
    }

    const messages = await run(tree);

    expect(messages.map((message) => message.message)).toEqual([
      "The data element has a value; v2.5.1 keeps it only for backward compatibility.",
    ]);
  });

  it("reports nothing in a backward-compatible field that holds the explicit null, even in a backward-compatible component", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.5.1"),
        // ZPD|1|""
        s("ZPD", f("1"), f('""'))
      )
    );
    const field = select(tree, "ZPD.2");
    const component = select(tree, "ZPD.2.1");
    if (field && component) {
      field.node.data = { id: "ZPD-2", name: "Site Code", optionality: "B" };
      component.node.data = {
        id: "CWE.1",
        name: "Identifier",
        optionality: "B",
      };
    }

    expect(await run(tree)).toEqual([]);
  });

  it("reports a backward-compatible component once when one of its subcomponents is backward compatible too", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.5.1"),
        // ZPD|1|A&B
        s("ZPD", f("1"), f(c("A", "B")))
      )
    );
    const component = select(tree, "ZPD.2.1");
    const subcomponent = select(tree, "ZPD.2.1.2");
    if (component && subcomponent) {
      component.node.data = {
        id: "CWE.1",
        name: "Identifier",
        optionality: "B",
      };
      subcomponent.node.data = {
        id: "HD.2",
        name: "Universal ID",
        optionality: "B",
      };
    }

    const messages = await run(tree);

    expect(messages.map((message) => message.message)).toEqual([
      "The data element has a value; v2.5.1 keeps it only for backward compatibility.",
    ]);
  });

  // The finding names the version, so the rule reads it from the profile
  // context that `@glion/annotate-profile-context` puts on the file.
  it("reports nothing on a file without a profile version", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.5.1"),
        // DG1|1|I9|250.00|DIABETES
        s("DG1", f("1"), f("I9"), f("250.00"), f("DIABETES"))
      )
    );
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .use(hl7v2AnnotateProfileDatatypes)
      .run(tree, new VFile());
    const file = new VFile();

    await unified().use(hl7v2LintBackwardCompatible).run(tree, file);

    expect(file.messages).toEqual([]);
  });

  // `W` is a different status, reported by `@glion/lint-profile-withdrawn`.
  it("does not report a withdrawn field", async () => {
    // v2.6 DG1-2 (Diagnosis Coding Method) is withdrawn
    expect(
      await lint(
        msh("2.6"),
        // DG1|1|I9|250.00
        s("DG1", f("1"), f("I9"), f("250.00"))
      )
    ).toEqual([]);
  });

  // The standard does not define Z-segments, so they have no optionality.
  it("skips a segment without a profile", async () => {
    expect(
      await lint(
        msh("2.5.1"),
        // ZPD|1|X
        s("ZPD", f("1"), f("X"))
      )
    ).toEqual([]);
  });
});

import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Root, Segment } from "@glion/ast";
import { c, f, g, m, r, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { select } from "@glion/util-query";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintWithdrawn from "../src";

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
 * The findings of the rule on `tree`, after the annotators it needs have
 * put each element's optionality on the tree.
 */
const run = async (tree: Root) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2AnnotateProfileDatatypes)
    .use(hl7v2LintWithdrawn)
    .run(tree, file);
  return file.messages;
};

/**
 * The findings of the rule on a message of `segments`, written as HL7v2 text
 * and parsed.
 */
const lint = (...segments: Segment[]) => run(parseHL7v2(hl7(...segments)));

// HL7v2 marks an element `W` once it is withdrawn: it keeps its position,
// so later elements keep their numbers, but it must be left empty. The
// explicit null `""` is allowed, since it tells the receiver to delete a value.
describe("hl7v2LintWithdrawn", () => {
  describe("withdrawn fields", () => {
    // The full finding: its text, the value found (`actual`), the values HL7v2
    // accepts (`expected`: empty, or the explicit null), and which rule made it.
    it("reports a withdrawn field that has a value", async () => {
      // v2.7 AL1-6 (Identification Date) is withdrawn
      const [message, ...rest] = await lint(
        msh("2.7"),
        // AL1|1||PENICILLIN|||20240101
        s("AL1", f("1"), f(), f("PENICILLIN"), f(), f(), f("20240101"))
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The data element has a value; it is withdrawn in v2.7 and must be empty."
      );
      expect(message?.actual).toBe("20240101");
      expect(message?.expected).toEqual(["", '""']);
      expect(message?.ruleId).toBe("withdrawn");
      expect(message?.source).toBe("hl7v2-lint");
    });

    it("reports the field as HL7v2 text, with its escape sequences", async () => {
      const [message] = await lint(
        msh("2.7"),
        // AL1|1||PENICILLIN|||2024\F\01
        s("AL1", f("1"), f(), f("PENICILLIN"), f(), f(), f("2024|01"))
      );

      expect(message?.actual).toBe("2024\\F\\01");
    });

    // MSH-1 `X` and MSH-2 `E~\&`: the escape character in AL1-6 is written
    // `\E\` or `\X5C\`, and both hold a delimiter.
    it("reports the field without its text when the delimiters cannot write it", async () => {
      // The message is given as text: its value holds an escape character
      // that no escape sequence can write with these delimiters, so
      // `toHl7v2` throws `EscapeSequenceError` on it.
      const [message, ...rest] = await run(
        parseHL7v2(
          "MSHXE~\\&XSNDXFACXRCVXRFACX20241201XXADTEA01EADT_A01XMSG001XPX2.7\rAL1X1XXPCNXXX2024\\b\r"
        )
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The data element has a value; it is withdrawn in v2.7 and must be empty."
      );
      expect(message?.actual).toBeUndefined();
    });

    // `|||` leaves AL1-6 present but empty.
    it("accepts an empty withdrawn field", async () => {
      expect(
        await lint(
          msh("2.7"),
          // AL1|1||PENICILLIN|||
          s("AL1", f("1"), f(), f("PENICILLIN"), f(), f(), f())
        )
      ).toEqual([]);
    });

    // The segment stops at AL1-3, so AL1-6 is not in the message at all.
    it("accepts a withdrawn field absent from the end of its segment", async () => {
      expect(
        await lint(
          msh("2.7"),
          // AL1|1||PENICILLIN
          s("AL1", f("1"), f(), f("PENICILLIN"))
        )
      ).toEqual([]);
    });

    // `""` is HL7v2's explicit null: "delete this value", not a value.
    it("accepts the explicit null in a withdrawn field", async () => {
      expect(
        await lint(
          msh("2.7"),
          // AL1|1||PENICILLIN|||""
          s("AL1", f("1"), f(), f("PENICILLIN"), f(), f(), f('""'))
        )
      ).toEqual([]);
    });

    // The first repetition is empty and the next two are valued. The field is
    // reported once, not once per repetition, and `actual` is the whole field.
    it("reports a withdrawn field once when any of its repetitions has a value", async () => {
      const messages = await lint(
        msh("2.7"),
        // AL1|1||PENICILLIN|||~20240101~20240102
        s(
          "AL1",
          f("1"),
          f(),
          f("PENICILLIN"),
          f(),
          f(),
          f(r(), r("20240101"), r("20240102"))
        )
      );

      expect(messages.map((message) => message.actual)).toEqual([
        "~20240101~20240102",
      ]);
    });

    // The first component is empty and the second is `I9`: the field still has a value.
    it("reports a withdrawn field when only a later component has a value", async () => {
      // v2.6 DG1-2 (Diagnosis Coding Method) is withdrawn
      const messages = await lint(
        msh("2.6"),
        // DG1|1|^I9|250.00
        s("DG1", f("1"), f("", "I9"), f("250.00"))
      );

      expect(messages.map((message) => message.message)).toEqual([
        "The data element has a value; it is withdrawn in v2.6 and must be empty.",
      ]);
    });

    // The same segment as the previous test, in v2.5.1, before DG1-2 was withdrawn.
    it("accepts a value in the same field in a version that does not withdraw it", async () => {
      // v2.5.1 DG1-2 is required
      expect(
        await lint(
          msh("2.5.1"),
          // DG1|1|I9|250.00
          s("DG1", f("1"), f("I9"), f("250.00"))
        )
      ).toEqual([]);
    });

    // Grouping (as `@glion/transform-profile-groups` does) nests segments under
    // group nodes; HL7v2 text cannot express that, so the tree is built directly.
    it("reports a withdrawn field in a segment inside a segment group", async () => {
      const messages = await run(
        m(
          s(
            "MSH",
            f("|"),
            f("^~\\&"),
            ...Array.from({ length: 9 }, () => f("")),
            f("2.6")
          ),
          g("DIAGNOSIS", s("DG1", f("1"), f("I9"), f("250.00")))
        )
      );

      expect(messages.map((message) => message.message)).toEqual([
        "The data element has a value; it is withdrawn in v2.6 and must be empty.",
      ]);
    });

    // The report points at `I9` on line 2 (columns 7 to 9), and its ancestors
    // end at the field, so tools can highlight exactly the offending value.
    it("places the report on the withdrawn field", async () => {
      const [message] = await lint(
        msh("2.6"),
        // DG1|1|I9|250.00
        s("DG1", f("1"), f("I9"), f("250.00"))
      );

      expect(message?.place).toEqual({
        end: { column: 9, line: 2, offset: 77 },
        start: { column: 7, line: 2, offset: 75 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toEqual([
        "root",
        "segment",
        "field",
      ]);
    });
  });

  // Components carry an optionality too, from the datatype's component table.
  describe("withdrawn components", () => {
    // `MD` is the sixth component of PID-5 (XPN), the withdrawn XPN.6. The
    // report names the component by its datatype position, `XPN.6`.
    it("reports a withdrawn component that has a value", async () => {
      // v2.7 XPN.6 (Degree) is withdrawn
      const messages = await lint(
        msh("2.7"),
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
          "The data element has a value; it is withdrawn in v2.7 and must be empty.",
          "MD",
        ],
      ]);
    });

    // Three repetitions of PID-5: the first and third value XPN.6, the second does
    // not. Each repetition is its own name, so each gets its own report.
    it("reports a withdrawn component once in each repetition that values it", async () => {
      const messages = await lint(
        msh("2.7"),
        // PID|1||12345||DOE^JOHN^^^^MD~ROE^JANE~POE^JIM^^^^PHD
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f(
            r("DOE", "JOHN", "", "", "", "MD"),
            r("ROE", "JANE"),
            r("POE", "JIM", "", "", "", "PHD")
          )
        )
      );

      expect(messages.map((message) => message.actual)).toEqual(["MD", "PHD"]);
    });

    // XPN.6 is empty and XPN.7 (Name Type Code) is `L`: only XPN.6 is withdrawn.
    it("accepts an empty withdrawn component", async () => {
      expect(
        await lint(
          msh("2.7"),
          // PID|1||12345||DOE^JOHN^^^^^L
          s(
            "PID",
            f("1"),
            f(),
            f("12345"),
            f(),
            f("DOE", "JOHN", "", "", "", "", "L")
          )
        )
      ).toEqual([]);
    });
  });

  // No bundled profile withdraws a subcomponent, so a profile for a Z-segment
  // annotates ZPD-2.1.2 by hand, as a site's own annotator would.
  describe("withdrawn subcomponents", () => {
    it("reports a withdrawn subcomponent that has a value", async () => {
      const tree = parseHL7v2(
        hl7(
          msh("2.7"),
          // ZPD|1|A&B
          s("ZPD", f("1"), f(c("A", "B")))
        )
      );
      const subcomponent = select(tree, "ZPD.2.1.2");
      if (subcomponent) {
        subcomponent.node.data = {
          id: "ZPD.2",
          name: "Site Code",
          optionality: "W",
        };
      }

      const [message, ...rest] = await run(tree);

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The data element has a value; it is withdrawn in v2.7 and must be empty."
      );
      expect(message?.actual).toBe("B");
      expect(message?.place).toEqual({
        end: { column: 10, line: 2, offset: 78 },
        start: { column: 9, line: 2, offset: 77 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toEqual([
        "root",
        "segment",
        "field",
        "field-repetition",
        "component",
        "subcomponent",
      ]);
    });
  });

  // One report per withdrawn element: the components of a reported element,
  // withdrawn or not, are not reported again.
  it("reports a withdrawn field once when one of its components is withdrawn too", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.7"),
        // ZPD|1|A^B
        s("ZPD", f("1"), f("A", "B"))
      )
    );
    const field = select(tree, "ZPD.2");
    const component = select(tree, "ZPD.2.2");
    if (field && component) {
      field.node.data = { id: "ZPD-2", name: "Site Code", optionality: "W" };
      component.node.data = { id: "CWE.2", name: "Text", optionality: "W" };
    }

    const messages = await run(tree);

    expect(messages.map((message) => message.message)).toEqual([
      "The data element has a value; it is withdrawn in v2.7 and must be empty.",
    ]);
  });

  it("reports nothing in a withdrawn field that holds the explicit null, even in a withdrawn component", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.7"),
        // ZPD|1|""
        s("ZPD", f("1"), f('""'))
      )
    );
    const field = select(tree, "ZPD.2");
    const component = select(tree, "ZPD.2.1");
    if (field && component) {
      field.node.data = { id: "ZPD-2", name: "Site Code", optionality: "W" };
      component.node.data = {
        id: "CWE.1",
        name: "Identifier",
        optionality: "W",
      };
    }

    expect(await run(tree)).toEqual([]);
  });

  it("reports a withdrawn component once when one of its subcomponents is withdrawn too", async () => {
    const tree = parseHL7v2(
      hl7(
        msh("2.7"),
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
        optionality: "W",
      };
      subcomponent.node.data = {
        id: "HD.2",
        name: "Universal ID",
        optionality: "W",
      };
    }

    const messages = await run(tree);

    expect(messages.map((message) => message.message)).toEqual([
      "The data element has a value; it is withdrawn in v2.7 and must be empty.",
    ]);
  });

  // The report names the version that withdraws the element, so without
  // MSH-12 nothing is reported, even on an element annotated as withdrawn.
  it("reports nothing on an element annotated as withdrawn when the message has no version", async () => {
    const tree = parseHL7v2(
      hl7(
        msh(""),
        // ZPD|1|X
        s("ZPD", f("1"), f("X"))
      )
    );
    const field = select(tree, "ZPD.2");
    expect(field?.node.type).toBe("field");
    if (field) {
      field.node.data = { id: "ZPD-2", name: "Site Code", optionality: "W" };
    }

    expect(await run(tree)).toEqual([]);
  });

  // `B` is a different status, reported by `@glion/lint-profile-backward-compatible`.
  it("does not report a backward-compatible field", async () => {
    // v2.5.1 DG1-4 (Diagnosis Description) is backward compatible
    expect(
      await lint(
        msh("2.5.1"),
        // DG1|1|I9|250.00|DIABETES
        s("DG1", f("1"), f("I9"), f("250.00"), f("DIABETES"))
      )
    ).toEqual([]);
  });

  // The standard does not define Z-segments, so they have no optionality.
  it("skips a segment without a profile", async () => {
    expect(
      await lint(
        msh("2.7"),
        // ZPD|1|X
        s("ZPD", f("1"), f("X"))
      )
    ).toEqual([]);
  });

  // MSH-12 is empty, so no profile is loaded and nothing can be checked.
  it("reports nothing when the message has no version", async () => {
    expect(
      await lint(
        // MSH|^~\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01^ADT_A01|MSG001|P|
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
          f()
        ),
        // AL1|1||PENICILLIN|||20240101
        s("AL1", f("1"), f(), f("PENICILLIN"), f(), f(), f("20240101"))
      )
    ).toEqual([]);
  });
});

import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import type { Root, Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2AnnotateProfileFields } from "../src";

/**
 * An MSH segment declaring `version` in MSH-12, the version whose profile is
 * read.
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
 * The tree of a message of `segments`, written as HL7v2 text and parsed, after
 * the context plugin loaded its profile and this plugin annotated its fields.
 */
const annotate = async (...segments: Segment[]) => {
  const tree = parseHL7v2(toHl7v2(m(...segments)));
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .run(tree);
  return tree;
};

/** The field at `sequence` of the `index`-th segment named `name`. */
const field = (tree: Root, name: string, sequence: number, index = 0) => {
  const segment = tree.children.filter(
    (node) => node.type === "segment" && node.name === name
  )[index];
  return segment?.type === "segment"
    ? segment.children[sequence - 1]
    : undefined;
};

describe("hl7v2AnnotateProfileFields", () => {
  // Each field's `data` holds its row of the standard's segment attribute
  // table, column for column, with nothing added and nothing left blank.
  describe("field data mirrors the segment attribute table", () => {
    // Every column of PID-3's v2.5 row, and its position as `sequence`.
    it("copies the field's row", async () => {
      const tree = await annotate(
        msh("2.5"),
        // PID|1||12345
        s("PID", f("1"), f(), f("12345"))
      );

      expect(field(tree, "PID", 3)?.data).toStrictEqual({
        datatype: "CX",
        id: "PID-3",
        item: "106",
        maxLength: 250,
        name: "Patient Identifier List",
        optionality: "R",
        repetitions: "unbounded",
        sequence: 3,
      });
    });

    // From v2.6 the standard prints a withdrawn field with no length, datatype
    // or table, so its data has none of them either.
    it("annotates a withdrawn field with its row, which gives no datatype", async () => {
      // v2.6 DG1-2 (Diagnosis Coding Method) is withdrawn
      const tree = await annotate(
        msh("2.6"),
        // DG1|1|I9
        s("DG1", f("1"), f("I9"))
      );

      expect(field(tree, "DG1", 2)?.data).toStrictEqual({
        id: "DG1-2",
        item: "376",
        name: "Diagnosis Coding Method",
        optionality: "W",
        repetitions: 1,
        sequence: 2,
      });
    });

    // v2.5.1 prints no OPT for OBX-20, so `optionality` is absent, not invented.
    it("leaves out the optionality of a field whose row gives none", async () => {
      // v2.5.1 OBX-20 is reserved for harmonization with v2.6
      const tree = await annotate(
        msh("2.5.1"),
        // OBX||||||||||||||||||||X
        s("OBX", ...Array.from({ length: 19 }, () => f()), f("X"))
      );

      expect(field(tree, "OBX", 20)?.data).toStrictEqual({
        datatype: "var",
        id: "OBX-20",
        item: "9999",
        name: "Reserved for harmonization with V2.6",
        repetitions: 1,
        sequence: 20,
      });
    });
  });

  // The annotation describes the field, whether or not the message values it.
  it("annotates an empty field", async () => {
    const tree = await annotate(
      msh("2.5"),
      // PID||
      s("PID", f(), f())
    );

    expect(field(tree, "PID", 1)?.data?.id).toBe("PID-1");
  });

  // Two OBX segments: OBX-2 is annotated in both.
  it("annotates the fields of every segment with the same name", async () => {
    const tree = await annotate(
      msh("2.5"),
      // OBX|1|NM
      s("OBX", f("1"), f("NM")),
      // OBX|2|ST
      s("OBX", f("2"), f("ST"))
    );

    expect(field(tree, "OBX", 2, 0)?.data?.id).toBe("OBX-2");
    expect(field(tree, "OBX", 2, 1)?.data?.id).toBe("OBX-2");
  });

  // Another plugin may hold a reference to `field.data`; the annotator writes
  // into that same object, so the reference stays valid.
  it("fills the data object already on a field, and does not replace it", async () => {
    const tree = parseHL7v2(
      toHl7v2(
        m(
          msh("2.5"),
          // PID|1
          s("PID", f("1"))
        )
      )
    );
    const pid1 = field(tree, "PID", 1);
    const data = {};
    if (pid1) {
      pid1.data = data;
    }
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    expect(pid1?.data).toBe(data);
    expect(data).toMatchObject({ id: "PID-1", name: "Set ID - PID" });
  });

  // The message gives PID a 40th field, which v2.5 does not define.
  it("does not annotate a field past the last one the segment defines", async () => {
    // v2.5 PID defines 39 fields
    const tree = await annotate(
      msh("2.5"),
      // PID||||||||||||||||||||||||||||||||||||||||X
      s("PID", ...Array.from({ length: 39 }, () => f()), f("X"))
    );

    expect(field(tree, "PID", 39)?.data?.id).toBe("PID-39");
    expect(field(tree, "PID", 40)?.data).toBeUndefined();
  });

  // The standard does not define Z-segments.
  it("does not annotate a segment without a profile", async () => {
    const tree = await annotate(
      msh("2.5"),
      // ZPD|custom
      s("ZPD", f("custom"))
    );

    expect(field(tree, "ZPD", 1)?.data).toBeUndefined();
  });

  // MSH-12 is empty, so no profile is loaded.
  it("annotates nothing when the message has no version", async () => {
    const tree = await annotate(
      msh(""),
      // PID|1
      s("PID", f("1"))
    );

    expect(field(tree, "PID", 1)?.data).toBeUndefined();
  });

  // The annotator reads the profile `@glion/annotate-profile-context` loads;
  // run alone, it has nothing to read.
  it("annotates nothing without the profile context", async () => {
    const tree = parseHL7v2(
      toHl7v2(
        m(
          msh("2.5"),
          // PID|1
          s("PID", f("1"))
        )
      )
    );
    await unified().use(hl7v2AnnotateProfileFields).run(tree);

    expect(field(tree, "PID", 1)?.data).toBeUndefined();
  });
});

import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import type { Field, Root } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2AnnotateProfileFields } from "../src";

/** Build a standard MSH segment for a given version. */
function msh(version: string) {
  return s(
    "MSH",
    f("|"), // MSH-1
    f("^~\\&"), // MSH-2
    f("SENDER"), // MSH-3
    f("FAC"), // MSH-4
    f("RECV"), // MSH-5
    f("RFAC"), // MSH-6
    f("20241201"), // MSH-7
    f(""), // MSH-8
    f(c("ADT"), c("A01"), c("ADT_A01")), // MSH-9
    f("MSG001"), // MSH-10
    f("P"), // MSH-11
    f(version) // MSH-12
  );
}

function getField(tree: Root, segmentName: string, fieldIndex: number): Field {
  for (const child of tree.children) {
    if (child.type === "segment" && child.name === segmentName) {
      return child.children[fieldIndex]!;
    }
  }
  throw new Error(`Segment ${segmentName} not found`);
}

describe("hl7v2AnnotateProfileFields", () => {
  it("leaves out the datatype of a withdrawn field the standard gives none", async () => {
    const tree = m(msh("2.6"), s("DG1", f("1"), f("I9")));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // v2.6 DG1-2 (Diagnosis Coding Method) is withdrawn and has no datatype
    expect(getField(tree, "DG1", 1).data).toStrictEqual({
      id: "DG1-2",
      item: "376",
      name: "Diagnosis Coding Method",
      optionality: "W",
      repetitions: 1,
    });
  });

  it("leaves out the optionality of a field the standard records none for", async () => {
    const fields = Array.from({ length: 20 }, () => f(""));
    const tree = m(msh("2.5.1"), s("OBX", ...fields.slice(0, 19), f("X")));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // v2.5.1 OBX-20 is reserved for harmonization with v2.6, with no optionality
    expect(getField(tree, "OBX", 19).data).toStrictEqual({
      datatype: "var",
      id: "OBX-20",
      item: "9999",
      name: "Reserved for harmonization with V2.6",
      repetitions: 1,
    });
  });

  it("annotates MSH fields with profile metadata", async () => {
    const tree = m(msh("2.5"));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // MSH-9 (Message Type) — sequence 9
    const msh9 = getField(tree, "MSH", 8); // 0-based index
    expect(msh9.data).toEqual({
      datatype: "MSG",
      id: "MSH-9",
      item: "9",
      maxLength: 15,
      name: "Message Type",
      optionality: "R",
      repetitions: 1,
    });
  });

  it("annotates PID fields with correct profiles", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe^John"))
    );

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // PID-3 (Patient Identifier List) — sequence 3
    const pid3 = getField(tree, "PID", 2);
    expect(pid3.data).toEqual({
      datatype: "CX",
      id: "PID-3",
      item: "106",
      maxLength: 250,
      name: "Patient Identifier List",
      optionality: "R",
      repetitions: "unbounded",
    });
  });

  it("skips Z-segments without error", async () => {
    const tree = m(msh("2.5"), s("ZZZ", f("custom1"), f("custom2")));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // Z-segment fields should have no profile data
    const zzz1 = getField(tree, "ZZZ", 0);
    expect(zzz1.data).toBeUndefined();
  });

  it("returns tree unchanged when MSH-12 is missing", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RECV"),
        f("RFAC"),
        f("20241201"),
        f(""),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f("P")
        // MSH-12 is missing
      )
    );

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // No fields should be annotated
    for (const child of tree.children) {
      if (child.type === "segment") {
        for (const field of child.children) {
          expect(field.data?.name).toBeUndefined();
        }
      }
    }
  });

  it("works with multiple segments of the same type", async () => {
    const tree = m(
      msh("2.5"),
      s("OBX", f("1"), f("NM"), f("1234"), f(""), f("42")),
      s("OBX", f("2"), f("ST"), f("5678"), f(""), f("normal"))
    );

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // Both OBX segments should have annotated fields
    let obxCount = 0;
    for (const child of tree.children) {
      if (child.type === "segment" && child.name === "OBX") {
        obxCount++;
        // OBX-2 (Value Type) — sequence 2
        const obx2 = child.children[1]!;
        expect(obx2.data?.datatype).toBeDefined();
      }
    }
    expect(obxCount).toBe(2);
  });

  it("handles empty fields without error", async () => {
    const tree = m(msh("2.5"), s("PID", f(""), f(""), f("")));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // Even empty fields get annotated with their profile
    const pid1 = getField(tree, "PID", 0);
    expect(pid1.data).toEqual({
      datatype: "SI",
      id: "PID-1",
      item: "104",
      maxLength: 4,
      name: "Set ID - PID",
      optionality: "O",
      repetitions: 1,
    });
  });

  it("sets maxLength when available in the profile", async () => {
    const tree = m(msh("2.5"));

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree);

    // MSH-1 (Field Separator) has maxLength = 1
    const msh1 = getField(tree, "MSH", 0);
    expect(msh1.data?.maxLength).toBe(1);
  });
});

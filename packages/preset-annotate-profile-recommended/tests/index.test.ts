import type {
  Component,
  Field,
  FieldRepetition,
  Root,
  Segment,
} from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import hl7v2PresetAnnotateProfileRecommended from "../src";

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

function getSegment(tree: Root, name: string): Segment {
  for (const child of tree.children) {
    if (child.type === "segment" && child.name === name) {
      return child;
    }
  }
  throw new Error(`Segment ${name} not found`);
}

function getField(tree: Root, segmentName: string, index: number): Field {
  return getSegment(tree, segmentName).children[index];
}

function getFirstRepetition(field: Field): FieldRepetition {
  return field.children[0];
}

function getComponent(repetition: FieldRepetition, index: number): Component {
  return repetition.children[index];
}

describe("hl7v2PresetAnnotateProfileRecommended", () => {
  it("annotates all node levels on a v2.5 message", async () => {
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f("1"), // PID-1
        f(""), // PID-2
        f("12345"), // PID-3
        f(""), // PID-4
        f(c("Doe"), c("John")), // PID-5 (XPN)
        f(""), // PID-6
        f("19800101"), // PID-7
        f("F") // PID-8 (Administrative Sex — coded, table HL70001)
      )
    );

    await unified().use(hl7v2PresetAnnotateProfileRecommended).run(tree);

    // Fields annotator: PID-5 should have field profile data
    const pid5 = getField(tree, "PID", 4);
    expect(pid5.data?.datatype).toBe("XPN");
    expect(pid5.data?.optionality).toBe("R");

    // Datatypes annotator: PID-5 rep should be composite
    const rep = getFirstRepetition(pid5);
    expect(rep.data?.datatypeId).toBe("XPN");
    expect(rep.data?.kind).toBe("composite");

    // Datatypes annotator: XPN.1 (Family Name) is composite (FN)
    const comp0 = getComponent(rep, 0);
    expect(comp0.data?.id).toBe("XPN.1");
    expect(comp0.data?.name).toBe("Family Name");
    expect(comp0.data?.datatypeId).toBe("FN");
    expect(comp0.data?.kind).toBe("composite");

    // Full cascade: FN.1 (Surname) subcomponent should be annotated as primitive
    const sub0 = comp0.children[0];
    expect(sub0.data?.id).toBe("FN.1");
    expect(sub0.data?.name).toBe("Surname");
    expect(sub0.data?.kind).toBe("primitive");

    // Code systems annotator: codeSystem on field, resolved code on repetition
    const pid8 = getField(tree, "PID", 7);
    expect(pid8.data?.codeSystem?.id).toBe("v2-0001");
    expect(getFirstRepetition(pid8).data?.code?.display).toBe("Female");
  });

  it("works with messages missing MSH-12", async () => {
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
      ),
      s("PID", f("1"))
    );

    await unified().use(hl7v2PresetAnnotateProfileRecommended).run(tree);

    const pid1 = getField(tree, "PID", 0);
    expect(pid1.data?.name).toBeUndefined();
  });

  it("handles Z-segments gracefully", async () => {
    const tree = m(msh("2.5"), s("ZZZ", f("custom")));

    await unified().use(hl7v2PresetAnnotateProfileRecommended).run(tree);

    const zzz1 = getField(tree, "ZZZ", 0);
    expect(zzz1.data?.name).toBeUndefined();
  });
});

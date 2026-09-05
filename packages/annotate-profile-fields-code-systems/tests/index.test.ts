import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Field, FieldRepetition, Root } from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
import { profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it, vi } from "vitest";

import { hl7v2AnnotateProfileFieldsCodeSystems } from "../src";

function msh(version: string) {
  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(""),
    f(c("ADT"), c("A01"), c("ADT_A01")),
    f("MSG001"),
    f("P"),
    f(version)
  );
}

function processor() {
  return unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2AnnotateProfileFieldsCodeSystems);
}

function getField(tree: Root, segmentName: string, fieldIndex: number): Field {
  for (const child of tree.children) {
    if (child.type === "segment" && child.name === segmentName) {
      return child.children[fieldIndex]!;
    }
  }
  throw new Error(`Segment ${segmentName} not found`);
}

function getRep(field: Field, repIndex = 0): FieldRepetition {
  return field.children[repIndex]!;
}

describe("hl7v2AnnotateProfileFieldsCodeSystems", () => {
  it("annotates field with codeSystem and repetition with resolved code", async () => {
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f("1"),
        f(""),
        f("12345"),
        f(""),
        f(c("Doe"), c("John")),
        f(""),
        f("19800101"),
        f("F")
      )
    );

    await processor().run(tree);

    const pid8 = getField(tree, "PID", 7);
    expect(pid8.data?.codeSystem).toEqual({
      id: "v2-0001",
      name: "AdministrativeSex",
      title: "administrativeSex",
    });

    const rep = getRep(pid8);
    expect(rep.data?.code).toEqual({
      display: "Female",
      status: "active",
      value: "F",
    });
  });

  it("resolves each repetition independently", async () => {
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f("1"),
        f(""),
        f("12345"),
        f(""),
        f("Doe"),
        f(""),
        f(""),
        f(r(c("F")), r(c("M")))
      )
    );

    await processor().run(tree);

    const pid8 = getField(tree, "PID", 7);
    // codeSystem on the field — same for both reps
    expect(pid8.data?.codeSystem?.id).toBe("v2-0001");

    // Each rep has its own resolved code
    expect(getRep(pid8, 0).data?.code?.display).toBe("Female");
    expect(getRep(pid8, 1).data?.code?.display).toBe("Male");
  });

  it("sets codeSystem on field but no code on rep when value is unknown", async () => {
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f("1"),
        f(""),
        f("12345"),
        f(""),
        f("Doe"),
        f(""),
        f(""),
        f("INVALID")
      )
    );

    await processor().run(tree);

    const pid8 = getField(tree, "PID", 7);
    expect(pid8.data?.codeSystem?.id).toBe("v2-0001");
    expect(getRep(pid8).data?.code).toBeUndefined();
  });

  it("sets codeSystem on field but no code on rep when field is empty", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe"), f(""), f(""), f(""))
    );

    await processor().run(tree);

    const pid8 = getField(tree, "PID", 7);
    expect(pid8.data?.codeSystem?.id).toBe("v2-0001");
    expect(getRep(pid8).data?.code).toBeUndefined();
  });

  it("annotates EVN-1 (Event Type Code)", async () => {
    const tree = m(msh("2.5"), s("EVN", f("A01"), f("20241201120000")));

    await processor().run(tree);

    const evn1 = getField(tree, "EVN", 0);
    expect(evn1.data?.codeSystem?.id).toBe("v2-0003");
    expect(getRep(evn1).data?.code?.value).toBe("A01");
    expect(getRep(evn1).data?.code?.display).toBeDefined();
  });

  it("skips fields without table reference", async () => {
    const tree = m(msh("2.5"), s("PID", f("1")));
    await processor().run(tree);

    const pid1 = getField(tree, "PID", 0);
    expect(pid1.data?.codeSystem).toBeUndefined();
  });

  it("skips Z-segments", async () => {
    const tree = m(msh("2.5"), s("ZZZ", f("custom")));
    await processor().run(tree);

    const zzz1 = getField(tree, "ZZZ", 0);
    expect(zzz1.data?.codeSystem).toBeUndefined();
  });

  it("returns tree unchanged when fields annotator did not run", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe"), f(""), f(""), f("F"))
    );

    await unified().use(hl7v2AnnotateProfileFieldsCodeSystems).run(tree);

    expect(getField(tree, "PID", 7).data?.codeSystem).toBeUndefined();
  });

  it("produces identical results when run three times", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe"), f(""), f(""), f("F"))
    );
    const proc = processor();

    await proc.run(tree);
    const first = JSON.stringify(tree);

    await proc.run(tree);
    expect(JSON.stringify(tree)).toBe(first);

    await proc.run(tree);
    expect(JSON.stringify(tree)).toBe(first);
  });

  it("reports unexpected load errors as VFile messages", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe"), f(""), f(""), f("F"))
    );
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .run(tree, file);

    const loadError = new TypeError("Dynamic import failed");
    const spy = vi
      .spyOn(profiles.codeSystems, "load")
      .mockRejectedValue(loadError);

    try {
      await unified()
        .use(hl7v2AnnotateProfileFieldsCodeSystems)
        .run(tree, file);
    } finally {
      spy.mockRestore();
    }

    expect(getField(tree, "PID", 7).data?.codeSystem).toBeUndefined();
    const msgs = file.messages.filter(
      (msg) => msg.source === "hl7v2-annotate-profile-fields-code-systems"
    );
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]!.cause).toBe(loadError);
  });

  // Regression: PR #544 erroneously stripped `table: "HL70100"` from BLG-1
  // ("When to Charge", CCD) in v2.6+, so the code-systems annotator skipped
  // BLG-1 and attached no `codeSystem`/`code`. The binding was restored for
  // v2.6–v2.8.2; BLG-1 should now annotate identically to v2.5.1.
  describe("BLG-1 (When to Charge) code-system annotation across versions", () => {
    const versions = ["2.5.1", "2.6", "2.7", "2.7.1", "2.8", "2.8.1", "2.8.2"];

    it.each(versions)(
      "attaches codeSystem to BLG-1 and resolves the rep code under v%s",
      async (version) => {
        const tree = m(msh(version), s("BLG", f(c("O"), c("20241201"))));

        await processor().run(tree);

        const blg1 = getField(tree, "BLG", 0);
        expect(blg1.data?.table).toBe("HL70100");
        expect(blg1.data?.codeSystem).toEqual({
          id: "v2-0100",
          name: "InvocationEvent",
          title: "invocationEvent",
        });
        expect(getRep(blg1).data?.code).toEqual({
          display: "On receipt of order",
          status: "active",
          value: "O",
        });
      }
    );

    it.each(versions)(
      "sets codeSystem but no code when BLG-1 value is not in table under v%s",
      async (version) => {
        const tree = m(msh(version), s("BLG", f(c("ZZZ"), c("20241201"))));

        await processor().run(tree);

        const blg1 = getField(tree, "BLG", 0);
        expect(blg1.data?.codeSystem?.id).toBe("v2-0100");
        expect(getRep(blg1).data?.code).toBeUndefined();
      }
    );
  });
});

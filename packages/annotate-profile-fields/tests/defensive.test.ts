import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
/**
 * Defensive tests for hl7v2-annotate-profile-fields.
 *
 * Tests malformed ASTs, edge cases, and adversarial inputs
 * that could break the annotator.
 */
import type { Field, Root, Segment } from "@glion/ast";
import { c, f, g, m, s } from "@glion/builder";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2AnnotateProfileFields } from "../src";

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

const processor = unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields);

function getField(tree: Root, segmentName: string, fieldIndex: number): Field {
  for (const child of tree.children) {
    if (child.type === "segment" && child.name === segmentName) {
      return child.children[fieldIndex]!;
    }
  }
  throw new Error(`Segment ${segmentName} not found`);
}

describe("defensive: malformed AST structure", () => {
  it("handles root with no children", async () => {
    const tree = m();
    await processor.run(tree);
    expect(tree.children).toHaveLength(0);
  });

  it("handles segment with zero fields", async () => {
    const tree = m(msh("2.5"), s("PID"));
    await processor.run(tree);

    // MSH should still be annotated
    for (const child of tree.children) {
      if (child.type === "segment" && child.name === "MSH") {
        expect(child.children[8]!.data?.id).toBe("MSH-9");
      }
    }
  });

  it("annotates fields inside group nodes correctly", async () => {
    // Groups change the ancestor chain: root > group > segment > field
    const tree = m(
      msh("2.5"),
      g(
        "PATIENT",
        s("PID", f("1"), f(""), f("12345"), f(""), f(c("Doe"), c("John")))
      )
    );

    await processor.run(tree);

    // PID inside the group should still be annotated
    const group = tree.children[1];
    expect(group!.type).toBe("group");
    if (group!.type === "group") {
      const pid = group!.children[0] as Segment;
      expect(pid.name).toBe("PID");
      expect(pid.children[2]!.data?.id).toBe("PID-3");
    }
  });

  it("handles nested groups", async () => {
    const tree = m(
      msh("2.5"),
      g("ORDER", g("OBSERVATION", s("OBX", f("1"), f("NM"), f("1234"))))
    );

    await processor.run(tree);

    const outerGroup = tree.children[1];
    if (outerGroup!.type === "group") {
      const innerGroup = outerGroup!.children[0];
      if (innerGroup!.type === "group") {
        const obx = innerGroup!.children[0] as Segment;
        expect(obx.children[0]!.data?.id).toBe("OBX-1");
      }
    }
  });
});

describe("defensive: MSH special fields", () => {
  it("annotates MSH-1 (field separator) correctly", async () => {
    const tree = m(msh("2.5"));
    await processor.run(tree);

    const msh1 = tree.children[0]!;
    if (msh1.type === "segment") {
      expect(msh1.children[0]!.data?.id).toBe("MSH-1");
      expect(msh1.children[0]!.data?.name).toBe("Field Separator");
      expect(msh1.children[0]!.data?.maxLength).toBe(1);
    }
  });

  it("annotates MSH-2 (encoding characters) correctly", async () => {
    const tree = m(msh("2.5"));
    await processor.run(tree);

    const msh2 = (tree.children[0] as Segment).children[1]!;
    expect(msh2.data?.id).toBe("MSH-2");
    expect(msh2.data?.name).toBe("Encoding Characters");
  });
});

describe("defensive: version edge cases", () => {
  it("handles empty string version (MSH-12 = '')", async () => {
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
        f("P"),
        f("") // empty version
      )
    );

    await processor.run(tree);

    // No annotation — empty version is falsy
    for (const child of tree.children) {
      if (child.type === "segment") {
        for (const field of child.children) {
          expect(field.data?.name).toBeUndefined();
        }
      }
    }
  });

  it("handles garbage version string gracefully", async () => {
    const tree = m(msh("INVALID_VERSION"));

    // Should not throw — all profile loads fail, tree is unannotated
    await processor.run(tree);

    const msh9 = (tree.children[0] as Segment).children[8]!;
    expect(msh9.data?.id).toBeUndefined();
  });

  it("handles numeric-looking version (v2.3)", async () => {
    const tree = m(msh("2.3"));
    await processor.run(tree);

    // v2.3 profiles should load and annotate
    const msh9 = (tree.children[0] as Segment).children[8]!;
    expect(msh9.data?.id).toBe("MSH-9");
  });
});

describe("defensive: field count mismatches", () => {
  it("handles more fields than profile defines", async () => {
    // Add 30 fields to PID — profile only defines ~30 but some versions fewer
    const fields: Field[] = [];
    for (let i = 0; i < 40; i++) {
      fields.push(f(`value${i}`));
    }
    const tree = m(msh("2.5"), s("PID", ...fields));

    await processor.run(tree);

    // Fields within profile range should be annotated
    expect(fields[0]!.data?.id).toBe("PID-1");

    // Fields beyond profile range should have no annotation
    expect(fields[39]!.data?.id).toBeUndefined();
  });
});

describe("defensive: multiple MSH segments", () => {
  it("uses the first MSH version for all segments", async () => {
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f("12345")),
      // Second MSH with different version (malformed but possible)
      msh("2.3")
    );

    await processor.run(tree);

    // PID should be annotated (first MSH has version)
    const pid = tree.children[1] as Segment;
    expect(pid.children[2]!.data?.id).toBe("PID-3");
  });
});

describe("defensive: all Z-segments", () => {
  it("produces clean unannotated tree when all segments are Z-segments", async () => {
    const tree = m(
      msh("2.5"),
      s("ZAA", f("1"), f("2")),
      s("ZBB", f("x"), f("y"), f("z")),
      s("ZCC", f("test"))
    );

    await processor.run(tree);

    // MSH is annotated, Z-segments are not
    for (const child of tree.children) {
      if (child.type === "segment" && child.name.startsWith("Z")) {
        for (const field of child.children) {
          expect(field.data?.name).toBeUndefined();
        }
      }
    }
  });
});

describe("defensive: pre-existing data", () => {
  it("overwrites pre-existing field.data properties", async () => {
    const tree = m(msh("2.5"));
    const msh9 = (tree.children[0] as Segment).children[8]!;
    msh9.data = { id: "CUSTOM", name: "OverrideMe" };

    await processor.run(tree);

    // Profile data should overwrite custom values
    expect(msh9.data.id).toBe("MSH-9");
    expect(msh9.data.name).toBe("Message Type");
  });

  it("preserves non-conflicting pre-existing properties", async () => {
    const tree = m(msh("2.5"));
    const msh9 = (tree.children[0] as Segment).children[8]!;
    (msh9 as unknown as { data: Record<string, unknown> }).data = {
      customProp: "preserved",
    };

    await processor.run(tree);

    expect(msh9.data?.id).toBe("MSH-9");
    expect((msh9.data as Record<string, unknown>).customProp).toBe("preserved");
  });
});

describe("defensive: composite MSH-12 (VID)", () => {
  it("annotates correctly when MSH-12 is VID composite (2.5^USA^ISO)", async () => {
    // MSH-12 as VID: version^internationalCode^internationalVersionId
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
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG001"),
        f("P"),
        f(c("2.5"), c("USA"), c("ISO")) // VID composite
      ),
      s("PID", f("1"), f(""), f("12345"))
    );

    await processor.run(tree);

    // Fields should be annotated — version "2.5" extracted from MSH-12.1
    const pid3 = getField(tree, "PID", 2);
    expect(pid3.data?.id).toBe("PID-3");
  });
});

describe("defensive: idempotency", () => {
  it("produces identical results when run three times", async () => {
    const tree = m(msh("2.5"), s("PID", f("1"), f(""), f("12345")));

    await processor.run(tree);
    const firstRun = JSON.stringify(tree);

    await processor.run(tree);
    const secondRun = JSON.stringify(tree);

    await processor.run(tree);
    const thirdRun = JSON.stringify(tree);

    expect(secondRun).toBe(firstRun);
    expect(thirdRun).toBe(firstRun);
  });
});

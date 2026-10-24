import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintExtraFields from "../src";

/** Complete MSH with all required fields for a given version */
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

describe("hl7v2LintExtraFields", () => {
  it("no warnings when all fields are within bounds", async () => {
    const tree = m(msh("2.5.1"), s("PID", f("1"), f(""), f("ID123")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(0);
  });

  it("reports a segment with more fields than its profile defines (v2.5.1 PID has 39 fields)", async () => {
    // Build a PID with 41 fields (fields 40 and 41 are beyond the max)
    const fields = [];
    for (let i = 1; i <= 41; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "The segment has 41 fields; it allows at most 39 fields."
    );
    expect(errors[0]?.actual).toBe("41");
    expect(errors[0]?.source).toBe("hl7v2-lint");
  });

  it("skips Z-segments silently", async () => {
    const fields = [];
    for (let i = 1; i <= 50; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("ZPD", ...fields));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("silently skips when version is missing", async () => {
    const fields = [];
    for (let i = 1; i <= 50; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(s("MSH"), s("PID", ...fields));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("produces no warnings when PID has exactly max fields", async () => {
    // PID has 39 fields in v2.5.1 — build exactly 39
    const fields = [];
    for (let i = 1; i <= 39; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields));
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);
    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(0);
  });

  it("does not count empty fields after the last field with a value", async () => {
    const fields = [];
    for (let i = 1; i <= 39; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields, f(), f()));
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);
    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(0);
  });

  it("counts every empty field after the last defined field when strict", async () => {
    const fields = [];
    for (let i = 1; i <= 39; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields, f()));
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields, { strict: true })
      .run(tree, file);
    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "The segment has 40 fields; it allows at most 39 fields."
    );
    expect(errors[0]?.actual).toBe("40");
  });

  it("does not report a segment within its profile when strict", async () => {
    const fields = [];
    for (let i = 1; i <= 38; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields, f()));
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields, { strict: true })
      .run(tree, file);
    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(0);
  });

  it("counts empty fields before a field with a value past the last defined field", async () => {
    const fields = [];
    for (let i = 1; i <= 39; i++) {
      fields.push(f(`val${i}`));
    }
    const tree = m(msh("2.5.1"), s("PID", ...fields, f(), f("val41"), f()));
    const file = new VFile();
    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);
    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "The segment has 41 fields; it allows at most 39 fields."
    );
    expect(errors[0]?.actual).toBe("41");
  });

  it("reports MSH once, however many fields it has beyond its last", async () => {
    // MSH with extra fields beyond the defined max
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
        f("2.5.1"),
        f(""),
        f(""),
        f(""),
        f(""),
        f(""),
        f(""),
        f(""),
        f(""),
        f(""),
        f("extra1"),
        f("extra2")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "extra-fields");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "The segment has 23 fields; it allows at most 21 fields."
    );
    expect(errors[0]?.actual).toBe("23");
  });

  it("points a finding at the segment with extra fields", async () => {
    const fields = [];
    for (let i = 1; i <= 41; i++) {
      fields.push(f(`val${i}`));
    }
    const pid = s("PID", ...fields);
    pid.position = {
      end: { column: 250, line: 2, offset: 343 },
      start: { column: 1, line: 2, offset: 94 },
    };
    const tree = m(msh("2.5.1"), pid);
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraFields)
      .run(tree, file);

    const [message] = file.messages;
    expect(message?.place).toStrictEqual({
      end: { column: 250, line: 2, offset: 343 },
      start: { column: 1, line: 2, offset: 94 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
      "root",
      "segment",
    ]);
    expect(message?.ancestors?.at(-1)).toBe(pid);
  });
});

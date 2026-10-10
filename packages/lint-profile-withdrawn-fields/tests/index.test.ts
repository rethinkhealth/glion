import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintWithdrawnFields from "../src";

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

const lint = async (tree: ReturnType<typeof m>) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2LintWithdrawnFields)
    .run(tree, file);
  return file.messages.filter((msg) => msg.ruleId === "withdrawn-fields");
};

describe("hl7v2LintWithdrawnFields", () => {
  it("reports a value in a field HL7v2 has withdrawn", async () => {
    // v2.7 AL1-6 (Identification Date) is withdrawn
    const messages = await lint(
      m(
        msh("2.7"),
        s("AL1", f("1"), f(""), f("PENICILLIN"), f(""), f(""), f("20240101"))
      )
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toBe(
      "Field `AL1-6` (Identification Date) has a value; it is withdrawn in v2.7 and must be empty."
    );
    expect(messages[0]?.source).toBe("hl7v2-lint");
  });

  it("reports a withdrawn field before the last field of its segment", async () => {
    // v2.6 DG1-2 (Diagnosis Coding Method) is withdrawn
    const messages = await lint(
      m(msh("2.6"), s("DG1", f("1"), f("I9"), f("250.00")))
    );

    expect(messages.map((msg) => msg.message)).toEqual([
      "Field `DG1-2` (Diagnosis Coding Method) has a value; it is withdrawn in v2.6 and must be empty.",
    ]);
  });

  it("accepts an empty withdrawn field", async () => {
    const messages = await lint(
      m(msh("2.6"), s("DG1", f("1"), f(""), f("250.00")))
    );

    expect(messages).toEqual([]);
  });

  it("accepts a value in a field that is not withdrawn", async () => {
    // v2.5.1 DG1-2 is required, not withdrawn
    const messages = await lint(
      m(msh("2.5.1"), s("DG1", f("1"), f("I9"), f("250.00")))
    );

    expect(messages).toEqual([]);
  });

  it("skips a segment without a profile", async () => {
    const messages = await lint(m(msh("2.7"), s("ZPD", f("1"), f("X"))));

    expect(messages).toEqual([]);
  });
});

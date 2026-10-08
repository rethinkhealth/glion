import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintExtraComponents from "../src";

/** Complete MSH with all required fields — uses v2.7.1 */
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

describe("hl7v2LintExtraComponents", () => {
  it("no warnings when components are within bounds", async () => {
    // MSH-9 is MSG with 3 components in v2.7.1 — all 3 present, none extra
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
        f(c("ADT"), c("A01"), c("ADT_A01")), // exactly 3 components
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(0);
  });

  it("reports extra components beyond the datatype definition", async () => {
    // MSH-9 is MSG with 3 defined components — adding a 4th and 5th
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
        f(c("ADT"), c("A01"), c("ADT_A01"), c("EXTRA1"), c("EXTRA2")),
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe(
      "Component `MSH-9.4` has no definition; `MSG` defines 3 components in HL7 v2.7.1."
    );
    expect(errors[1].message).toBe(
      "Component `MSH-9.5` has no definition; `MSG` defines 3 components in HL7 v2.7.1."
    );
    expect(errors[0].source).toBe("hl7v2-lint");
  });

  it("warns when primitive field has extra components", async () => {
    // PID-1 is datatype SI (primitive) — maxComponent is 1
    // Two components means the second is extra
    const tree = m(msh("2.7.1"), s("PID", f(c("1"), c("extra"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      "Component `PID-1.2` has no definition; `SI` is a primitive datatype with no components in HL7 v2.7.1."
    );
  });

  it("no warning when primitive field has single component", async () => {
    // PID-1 is datatype SI (primitive) — single component is fine
    const tree = m(msh("2.7.1"), s("PID", f("1")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(0);
  });

  it("skips empty fields", async () => {
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
        f(), // MSH-9 empty
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(0);
  });

  it("skips Z-segments silently", async () => {
    const tree = m(
      msh("2.7.1"),
      s("ZPD", f(c("a"), c("b"), c("c"), c("d"), c("e")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(0);
  });

  it("silently skips when version is missing", async () => {
    const tree = m(s("MSH", f("|"), f("^~\\&")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("reports only for the repetition with extra components", async () => {
    // MSH-9 with two reps — first valid (3 components), second has 4
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
        f(
          r(c("ADT"), c("A01"), c("ADT_A01")), // valid
          r(c("ADT"), c("A01"), c("ADT_A01"), c("EXTRA")) // extra component
        ),
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintExtraComponents)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "extra-components"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      "Component `MSH-9.4` has no definition; `MSG` defines 3 components in HL7 v2.7.1."
    );
  });
});

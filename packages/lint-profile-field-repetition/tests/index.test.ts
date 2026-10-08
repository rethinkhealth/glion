import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintFieldRepetition from "../src";

/** Complete MSH with all required fields */
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

describe("hl7v2LintFieldRepetition", () => {
  it("no warnings for non-repeating field with single value", async () => {
    // PID-1 is repeatable: false — single value is fine
    const tree = m(msh("2.5"), s("PID", f("1")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(0);
  });

  it("no warnings for repeatable field with multiple repetitions", async () => {
    // PID-3 is repeatable: true — multiple reps are fine
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(""), f(r("id1"), r("id2"), r("id3")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(0);
  });

  it("reports non-repeatable field with multiple repetitions", async () => {
    // PID-1 is repeatable: false — 2 reps should trigger
    const tree = m(msh("2.5"), s("PID", f(r("1"), r("2"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) has 2 repetitions; it is not repeatable."
    );
    expect(errors[0]?.actual).toBe("2");
    expect(errors[0]?.source).toBe("hl7v2-lint");
  });

  it("reports multiple non-repeatable fields in the same segment", async () => {
    // PID-1 and PID-2 are both repeatable: false
    const tree = m(
      msh("2.5"),
      s("PID", f(r("1"), r("2")), f(r("extA"), r("extB")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) has 2 repetitions; it is not repeatable."
    );
    expect(errors[1]?.message).toBe(
      "Field `PID-2` (Patient ID) has 2 repetitions; it is not repeatable."
    );
  });

  it("reports violations across multiple segments", async () => {
    // PID-1 and OBX-1 are both repeatable: false
    const tree = m(
      msh("2.5"),
      s("PID", f(r("1"), r("2"))),
      s("OBX", f(r("1"), r("2")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) has 2 repetitions; it is not repeatable."
    );
    expect(errors[1]?.message).toBe(
      "Field `OBX-1` (Set ID - OBX) has 2 repetitions; it is not repeatable."
    );
  });

  it("does not flag empty fields", async () => {
    const tree = m(msh("2.5"), s("PID", f()));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(0);
  });

  it("skips Z-segments silently", async () => {
    const tree = m(msh("2.5"), s("ZPD", f(r("a"), r("b"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("silently skips when version is missing", async () => {
    const tree = m(s("MSH"), s("PID", f(r("1"), r("2"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("validates correctly when MSH-12 is composite VID — #489", async () => {
    function mshVid(version: string) {
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
        f(c(version), c("USA"), c("ISO")) // VID composite
      );
    }

    // PID-1 is not repeatable — 2 reps should trigger validation
    const tree = m(mshVid("2.5"), s("PID", f(r("1"), r("2"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    // The rule must actually run and find the repetition violation
    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) has 2 repetitions; it is not repeatable."
    );
  });
});

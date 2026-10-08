import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintFieldMaxLength from "../src";

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

describe("hl7v2LintFieldMaxLength", () => {
  it("produces no warnings when fields are within limits", async () => {
    // PID-1 maxLength=4 in v2.5
    const tree = m(msh("2.5"), s("PID", f("1234")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(0);
  });

  it("reports when field exceeds max length", async () => {
    // PID-1 maxLength=4, "12345" is 5 chars
    const tree = m(msh("2.5"), s("PID", f("12345")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) is 5 characters long; it allows at most 4 characters."
    );
    expect(errors[0]?.actual).toBe("5");
    expect(errors[0]?.source).toBe("hl7v2-lint");
  });

  it("skips empty fields", async () => {
    const tree = m(msh("2.5"), s("PID", f("")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(0);
  });

  it("checks each repetition independently", async () => {
    // PID-1 maxLength=4: first rep OK (3 chars), second exceeds (5 chars)
    const tree = m(msh("2.5"), s("PID", f(r("123"), r("12345"))));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) is 5 characters long; it allows at most 4 characters."
    );
  });

  it("measures composite field length across all components", async () => {
    // PID-2 is CX (composite) with maxLength=20
    // getLength sums all subcomponent values: 12 + 0 + 0 + 8 + 2 = 22 (exceeds 20)
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f("1"),
        f(c("ID1234567890"), c(""), c(""), c("HOSPITAL"), c("MR"))
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-2` (Patient ID) is 22 characters long; it allows at most 20 characters."
    );
    expect(errors[0]?.actual).toBe("22");
  });

  it("composite field within limits produces no warning", async () => {
    // PID-2 maxLength=20, getLength = 5 + 0 + 0 + 4 = 9 (within limit)
    const tree = m(
      msh("2.5"),
      s("PID", f("1"), f(c("ID123"), c(""), c(""), c("HOSP")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(0);
  });

  it("allows value at exactly maxLength", async () => {
    // PID-1 maxLength=4, "1234" is exactly 4 chars — should pass
    const tree = m(msh("2.5"), s("PID", f("1234")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(0);
  });

  it("skips Z-segments silently", async () => {
    const tree = m(
      msh("2.5"),
      s("ZPD", f("a very long value that exceeds anything"))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("silently skips when version is missing", async () => {
    const tree = m(s("MSH"), s("PID", f("12345")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
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

    // PID-1 maxLength=4, "12345" is 5 chars — should trigger validation
    const tree = m(mshVid("2.5"), s("PID", f("12345")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldMaxLength)
      .run(tree, file);

    // The rule must actually run and find the max-length violation
    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      "Field `PID-1` (Set ID - PID) is 5 characters long; it allows at most 4 characters."
    );
  });
});

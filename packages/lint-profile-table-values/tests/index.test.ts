import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintTableValues from "../src";

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

describe("hl7v2LintTableValues", () => {
  it("no warnings for valid coded value in HL7 table", async () => {
    // EVN-1 (Event Type Code) references HL70003 (type: "hl7")
    // "A01" is a valid code
    const tree = m(msh("2.5"), s("EVN", f("A01")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(0);
  });

  it("reports invalid coded value in HL7 table", async () => {
    // EVN-1 = "ZZZ" is not a valid code in table 0003
    const tree = m(msh("2.5"), s("EVN", f("ZZZ")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("EVN-1");
    expect(errors[0]?.message).toContain("ZZZ");
    expect(errors[0]?.source).toBe("hl7v2-lint");
  });

  it("skips empty field values", async () => {
    const tree = m(msh("2.5"), s("EVN", f("")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(0);
  });

  it("skips user-type tables", async () => {
    // PID-8 (Administrative Sex) references HL70001 which is type "user"
    const tree = m(
      msh("2.5"),
      s(
        "PID",
        f(""),
        f(""),
        f("12345"),
        f(""),
        f("Doe"),
        f(""),
        f(""),
        f("INVALID_BUT_USER_TABLE")
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "table-values" && msg.message.includes("PID-8")
    );
    expect(errors).toHaveLength(0);
  });

  it("skips Z-segments silently", async () => {
    const tree = m(msh("2.5"), s("ZPD", f("INVALID")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("silently skips when version is missing", async () => {
    const tree = m(s("MSH"), s("EVN", f("A01")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("validates each repeated segment independently", async () => {
    // Two EVN segments: first valid, second invalid
    const tree = m(msh("2.5"), s("EVN", f("A01")), s("EVN", f("INVALID")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("INVALID");
  });

  it("includes table description in error message", async () => {
    const tree = m(msh("2.5"), s("EVN", f("INVALID")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const error = file.messages.find((msg) => msg.ruleId === "table-values");
    expect(error?.message).toContain("Event type");
  });

  describe("field repetition handling", () => {
    /**
     * Build an OBX segment with OBX-10 (Nature of Abnormal Test, table 0080)
     * set to the given values
     */
    function obxWithAbnormalFlags(...codes: string[]) {
      const reps = codes.map((code) => r(code));
      return s(
        "OBX",
        f("1"), // OBX-1 Set ID
        f("NM"), // OBX-2 Value Type
        f("12345"), // OBX-3 Observation Identifier
        f(""), // OBX-4 Observation Sub-ID
        f("100"), // OBX-5 Observation Value
        f("mg/dL"), // OBX-6 Units
        f("70-110"), // OBX-7 References Range
        f("N"), // OBX-8 Abnormal Flags
        f(""), // OBX-9 Probability
        f(...reps) // OBX-10 Nature of Abnormal Test
      );
    }

    it("no warning for single valid repetition", async () => {
      const tree = m(msh("2.5"), obxWithAbnormalFlags("A"));
      const file = new VFile();

      await unified()
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2LintTableValues)
        .run(tree, file);

      const errors = file.messages.filter(
        (msg) => msg.ruleId === "table-values" && msg.message.includes("OBX-10")
      );
      expect(errors).toHaveLength(0);
    });

    it("warning for single invalid repetition", async () => {
      const tree = m(msh("2.5"), obxWithAbnormalFlags("Z"));
      const file = new VFile();

      await unified()
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2LintTableValues)
        .run(tree, file);

      const errors = file.messages.filter(
        (msg) => msg.ruleId === "table-values" && msg.message.includes("OBX-10")
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("Z");
    });

    it("warning for second invalid repetition (A~Z)", async () => {
      const tree = m(msh("2.5"), obxWithAbnormalFlags("A", "Z"));
      const file = new VFile();

      await unified()
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2LintTableValues)
        .run(tree, file);

      const errors = file.messages.filter(
        (msg) => msg.ruleId === "table-values" && msg.message.includes("OBX-10")
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("Z");
    });

    it("warning for first invalid repetition (Z~A)", async () => {
      const tree = m(msh("2.5"), obxWithAbnormalFlags("Z", "A"));
      const file = new VFile();

      await unified()
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2LintTableValues)
        .run(tree, file);

      const errors = file.messages.filter(
        (msg) => msg.ruleId === "table-values" && msg.message.includes("OBX-10")
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("Z");
    });

    it("warnings for both invalid repetitions (X~Z)", async () => {
      const tree = m(msh("2.5"), obxWithAbnormalFlags("X", "Z"));
      const file = new VFile();

      await unified()
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2LintTableValues)
        .run(tree, file);

      const errors = file.messages.filter(
        (msg) => msg.ruleId === "table-values" && msg.message.includes("OBX-10")
      );
      expect(errors).toHaveLength(2);
    });
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

    // EVN-1 = "ZZZ" is not a valid code — should trigger validation
    const tree = m(mshVid("2.5"), s("EVN", f("ZZZ")));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    // The rule must actually run and find the invalid table value
    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("ZZZ");
  });

  it("checks a CWE field's first component, the identifier, against its table", async () => {
    // ERR-3 (CWE) references HL70357; "ZZZ" is not a code in it
    const tree = m(
      msh("2.5"),
      s("ERR", f(""), f(""), f(c("ZZZ"), c("Unknown")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("ERR-3");
  });

  it("does not check an XPN name against the table of its name type component", async () => {
    // v2.6 PID-5 (XPN) references HL70200, which lists XPN.7 name type codes
    const tree = m(
      msh("2.6"),
      s("PID", f(""), f(""), f(""), f(""), f(c("DOE"), c("JOHN")))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintTableValues)
      .run(tree, file);

    const errors = file.messages.filter((msg) => msg.ruleId === "table-values");
    expect(errors).toHaveLength(0);
  });
});

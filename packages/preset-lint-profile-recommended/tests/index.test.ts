import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2PresetLintProfileRecommended from "../src";

/** Complete MSH with all required fields for v2.7.1 */
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

describe("hl7v2PresetLintProfileRecommended", () => {
  it("produces no warnings for a valid message", async () => {
    const tree = m(
      msh("2.5"),
      s("EVN", f("A01"), f("20241201")),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe^John")),
      s("PV1", f("1"), f("I"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("errors on a segment the event schema does not allow", async () => {
    const tree = m(
      msh("2.5"),
      s("EVN", f("A01"), f("20241201")),
      s("PID", f("1"), f(""), f("12345"), f(""), f("Doe^John")),
      s("ORC", f("NW")),
      s("PV1", f("1"), f("I"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]).toMatchObject({
      fatal: true,
      message: "Unexpected segment 'ORC'. Expected: NK1, PD1, PV1, ROL",
      ruleId: "segment-order",
    });
  });

  it("errors on a missing required field", async () => {
    // PID-3 is required but empty
    const tree = m(msh("2.5"), s("PID", f("1"), f(""), f(""), f(""), f("Doe")));
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    const requiredErrors = file.messages.filter(
      (msg) => msg.ruleId === "required-fields"
    );
    expect(requiredErrors.length).toBeGreaterThanOrEqual(1);
    expect(requiredErrors.every((msg) => msg.fatal === true)).toBe(true);
  });

  it("reports field max length violations", async () => {
    // PID-1 maxLength=4, "12345" exceeds
    const tree = m(msh("2.5"), s("PID", f("12345")));
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    const lengthErrors = file.messages.filter(
      (msg) => msg.ruleId === "field-max-length"
    );
    expect(lengthErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("errors on a repeated non-repeatable field", async () => {
    // PID-1 is not repeatable
    const tree = m(msh("2.5"), s("PID", f(r("1"), r("2"))));
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    const repErrors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(repErrors.length).toBeGreaterThanOrEqual(1);
    expect(repErrors.every((msg) => msg.fatal === true)).toBe(true);
  });

  it("reports table value violations", async () => {
    // EVN-1 = "ZZZ" is not in HL7 table 0003
    const tree = m(msh("2.5"), s("EVN", f("ZZZ")));
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    const tableErrors = file.messages.filter(
      (msg) => msg.ruleId === "table-values"
    );
    expect(tableErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("errors on a missing required component", async () => {
    // MSH-9 in v2.7.1 has 3 required components, only 2 provided
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
        f(c("ADT"), c("A01")), // missing component 3
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    const compErrors = file.messages.filter(
      (msg) => msg.ruleId === "required-components"
    );
    expect(compErrors.length).toBeGreaterThanOrEqual(1);
    expect(compErrors.every((msg) => msg.fatal === true)).toBe(true);
  });

  it("all five rules produce distinct ruleIds", async () => {
    // Craft a v2.5 message triggering 4 rules + a v2.7.1 message for required-components
    // v2.5: EVN-1 has table HL70003 (type "hl7"), PID fields for other rules
    const tree1 = m(
      msh("2.5"),
      s("EVN", f("ZZZ")), // invalid table value → table-values
      s(
        "PID",
        f(r("12345"), r("67890")), // PID-1: exceeds maxLength + not repeatable
        f(""),
        f(""), // PID-3 required but empty → required-fields
        f(""),
        f("Doe")
      )
    );
    const file1 = new VFile();
    await unified().use(hl7v2PresetLintProfileRecommended).run(tree1, file1);

    // v2.7.1: MSG has required components
    const tree2 = m(
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
        f(c("ADT"), c("A01")), // missing MSH-9.3 → required-components
        f("MSG001"),
        f("P"),
        f("2.7.1")
      )
    );
    const file2 = new VFile();
    await unified().use(hl7v2PresetLintProfileRecommended).run(tree2, file2);

    const allMessages = [...file1.messages, ...file2.messages];
    const ruleIds = new Set(allMessages.map((msg) => msg.ruleId));
    expect(ruleIds.has("required-fields")).toBe(true);
    expect(ruleIds.has("field-max-length")).toBe(true);
    expect(ruleIds.has("field-repetition")).toBe(true);
    expect(ruleIds.has("table-values")).toBe(true);
    expect(ruleIds.has("required-components")).toBe(true);
  });
});

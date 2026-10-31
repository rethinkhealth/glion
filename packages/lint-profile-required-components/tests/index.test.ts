import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { c, f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintRequiredComponents from "../src";

/**
 * An MSH segment declaring `version` in MSH-12, with `messageType` in MSH-9
 * (Message Type).
 */
const msh = (version: string, messageType = "ADT^A01^ADT_A01") =>
  `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||${messageType}|MSG001|P|${version}`;

/**
 * The findings of the rule on a message whose segments are given as HL7v2
 * text, after the annotators it needs have put each field's datatype on the
 * tree.
 */
const lint = async (...segments: string[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2LintRequiredComponents)
    .run(parseHL7v2(segments.map((segment) => `${segment}\r`).join("")), file);
  return file.messages;
};

// A component marked `R` in its datatype's component table must be present
// and not empty, whenever its field has a value. Most tests use MSH-9
// (Message Type): from v2.5, MSG.1 (Message Code), MSG.2 (Trigger Event)
// and MSG.3 (Message Structure) are all required.
describe("hl7v2LintRequiredComponents", () => {
  // `ADT^A01^ADT_A01` gives all three.
  it("accepts a field with every required component", async () => {
    expect(await lint(msh("2.5"))).toEqual([]);
  });

  // `ADT^A01` stops after the second component, so MSH-9.3 is not in the message.
  it("reports a required component that is not present", async () => {
    const [message, ...rest] = await lint(msh("2.5", "ADT^A01"));

    expect(rest).toEqual([]);
    expect(message?.message).toBe(
      "Component `MSH-9.3` (Message Structure) is not present; it is required."
    );
    expect(message?.ruleId).toBe("required-components");
    expect(message?.source).toBe("hl7v2-lint");
  });

  // `ADT^^ADT_A01` has the second component, but empty.
  it("reports a required component that is empty", async () => {
    const messages = await lint(msh("2.5", "ADT^^ADT_A01"));

    expect(messages.map((message) => message.message)).toEqual([
      "The component is empty; it is required.",
    ]);
  });

  // MSH-9.2 is `&A01`: its first subcomponent is empty, its second is not, so
  // the component has a value.
  it("accepts a required component whose first subcomponent is empty but a later one has a value", async () => {
    expect(await lint(msh("2.5", "ADT^&A01^ADT_A01"))).toEqual([]);
  });

  // `ADT` alone: MSH-9.2 and MSH-9.3 are both missing, one report each, in order.
  it("reports every missing required component of a field", async () => {
    const messages = await lint(msh("2.5", "ADT"));

    expect(messages.map((message) => message.message)).toEqual([
      "Component `MSH-9.2` (Trigger Event) is not present; it is required.",
      "Component `MSH-9.3` (Message Structure) is not present; it is required.",
    ]);
  });

  // An empty component is a node, so the report's ancestors end at it. It
  // points at the empty MSH-9.2, between the two `^` at column 45 of line 1.
  it("places the report on the empty component", async () => {
    const [message] = await lint(msh("2.5", "ADT^^ADT_A01"));

    expect(message?.place).toEqual({
      end: { column: 45, line: 1, offset: 44 },
      start: { column: 45, line: 1, offset: 44 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
      "component",
    ]);
  });

  // A missing component has no node, so the report's ancestors end at the
  // repetition that should hold it: `ADT^A01`, columns 41 to 48 of line 1.
  it("places the report on the repetition when the component is not present", async () => {
    const [message] = await lint(msh("2.5", "ADT^A01"));

    expect(message?.place).toEqual({
      end: { column: 48, line: 1, offset: 47 },
      start: { column: 41, line: 1, offset: 40 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
    ]);
  });

  // The first identifier has its ID Number (`12345`), the second does not:
  // only the second repetition is reported.
  it("checks every repetition of a repeating field", async () => {
    // v2.5 PID-3 (Patient Identifier List) is CX, whose CX.1 (ID Number) is required
    const messages = await lint(msh("2.5"), "PID|1||12345^^^HOSP~^^^HOSP");

    expect(messages.map((message) => message.message)).toEqual([
      "The component is empty; it is required.",
    ]);
  });

  // A component's `R` applies only when its field is present; whether PID-3
  // itself must be valued is `@glion/lint-profile-required-fields`' finding.
  it("does not check an empty field", async () => {
    expect(await lint(msh("2.5"), "PID|1||")).toEqual([]);
  });

  // PID-3 is `^^^`: four components, all empty, so the field has no value and
  // CX.1 (ID Number) is not checked.
  it("does not check a field whose components are all empty", async () => {
    expect(await lint(msh("2.5"), "PID|1||^^^")).toEqual([]);
  });

  // v2.6 withdraws MSA-5 (Delayed Acknowledgment Type) and gives it no
  // datatype, so it has no components to require.
  it("does not check a withdrawn field the standard gives no datatype", async () => {
    expect(await lint(msh("2.6", "ACK^A01^ACK"), "MSA|AA|MSG001|||D")).toEqual(
      []
    );
  });

  // SI is primitive: it has no components, so no component can be required.
  it("does not check a field of a primitive datatype", async () => {
    // v2.5 PID-1 (Set ID - PID) is SI
    expect(await lint(msh("2.5"), "PID|1^")).toEqual([]);
  });

  // The standard prints component tables from v2.5 on; before that, no
  // component is marked required.
  it("requires no component before v2.5, whose standard marks none", async () => {
    expect(await lint(msh("2.4", "ADT"))).toEqual([]);
  });

  // The standard does not define Z-segments, so their fields have no datatype.
  // The rule names each component it reports by its field's ID.
  it("does not check a field that has no element ID", async () => {
    const field = f(c("ADT"));
    field.data = { datatype: "MSG", name: "Message Type" };
    const tree = parseHL7v2(msh("2.5"));
    tree.children.push(s("ZPD", field));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintRequiredComponents)
      .run(tree, file);

    expect(file.messages).toEqual([]);
  });

  it("does not check a field whose datatype the profile does not define", async () => {
    const field = f(c("ADT"));
    field.data = { datatype: "ZZZ", id: "ZPD-1", name: "Site Code" };
    const tree = parseHL7v2(msh("2.5"));
    tree.children.push(s("ZPD", field));
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintRequiredComponents)
      .run(tree, file);

    expect(file.messages).toEqual([]);
  });

  // The rule reads the datatypes from the profile context that
  // `@glion/annotate-profile-context` puts on the file.
  it("reports nothing on a file without a profile, even for a field with a datatype", async () => {
    const field = f(c("ADT"));
    field.data = { datatype: "MSG", id: "ZPD-1", name: "Message Type" };
    const file = new VFile();

    await unified()
      .use(hl7v2LintRequiredComponents)
      .run(m(s("ZPD", field)), file);

    expect(file.messages).toEqual([]);
  });

  it("skips a segment without a profile", async () => {
    expect(await lint(msh("2.5"), "ZPD|A^^B")).toEqual([]);
  });

  // MSH-12 is empty, so no profile is loaded and nothing can be checked.
  it("reports nothing when the message has no version", async () => {
    expect(await lint(msh("", "ADT"))).toEqual([]);
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  // MSH-12 is a VID, whose first component is the version: `2.5^USA^ISO`.
  it("reads the version from a composite MSH-12", async () => {
    const messages = await lint(msh("2.5^USA^ISO", "ADT^A01"));

    expect(messages.map((message) => message.message)).toEqual([
      "Component `MSH-9.3` (Message Structure) is not present; it is required.",
    ]);
  });
});

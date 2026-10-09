import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2PresetLintRecommended from "../src/index";

describe("hl7v2-preset-lint-recommended", () => {
  it("should have no issues for a valid message", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P"),
        f("2.5")
      ),
      s("PID", f("1"), f("John Doe")),
      s("OBR", f("1"), f("845439^GHH OE"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("errors when segment header length is invalid", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P"),
        f("2.5")
      ),
      s("PIDTOOLONG", f("PATID1234^5^M11")),
      s("OBR", f("1"), f("845439^GHH OE"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The Segment ID `PIDTOOLONG` is 10 characters long; a Segment ID must be exactly 3 characters."
    );
    expect(file.messages[0].fatal).toBeTruthy();
  });

  it("errors when message header is missing", async () => {
    const tree = m(
      s("PID", f("PATID1234^5^M11")),
      s("OBR", f("1"), f("845439^GHH OE"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    const header = file.messages.find(
      (msg) => msg.ruleId === "segment-required-message-header"
    );
    expect(header).toMatchObject({
      fatal: true,
      message:
        "The first segment is `PID`; a message must start with the message header segment (`MSH`).",
    });
  });

  it("errors when a Z-segment precedes the message header", async () => {
    const tree = m(
      s("ZA1", f("1")),
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P"),
        f("2.5")
      ),
      s("EVN", f("A01")),
      s("PID", f("1"), f("John Doe")),
      s("PV1", f("1"), f("I"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The first segment is `ZA1`; a message must start with the message header segment (`MSH`)."
    );
    expect(file.messages[0].ruleId).toBe("segment-required-message-header");
    expect(file.messages[0].fatal).toBe(true);
  });

  it("errors when message version is missing", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P")
        // MSH-12 (version) is missing
      )
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The message has no `MSH-12` (Version ID); a message must declare its HL7v2 version."
    );
    expect(file.messages[0].fatal).toBeTruthy();
  });

  it("errors when message version is unsupported", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P"),
        f("3.0") // Unsupported version
      )
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    const version = file.messages.find(
      (msg) => msg.ruleId === "message-version"
    );
    expect(version).toMatchObject({
      actual: "3.0",
      expected: ["<3.0.0 >=2.3"],
      fatal: true,
      message:
        "The version in `MSH-12` (Version ID) is `3.0`; it must satisfy `<3.0.0 >=2.3`.",
    });
  });

  it("warns about trailing empty fields", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG00001"),
        f("P"),
        f("2.5")
      ),
      s("PID", f("1"), f("John Doe"), f(""), f("")) // Trailing empty fields
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "Segment `PID` ends with 2 empty fields; a segment should end at its last field with a value."
    );
    expect(file.messages[0].fatal).toBeFalsy(); // This is a warning, not an error
  });

  it("reports multiple errors from different rules", async () => {
    const tree = m(
      s("PIDTOOLONG", f("1"), f("John Doe")) // Missing MSH + invalid header length
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintRecommended).run(tree, file);

    expect(file.messages.length).toBeGreaterThanOrEqual(2);
    // Should have errors for both missing MSH and invalid header length
  });
});

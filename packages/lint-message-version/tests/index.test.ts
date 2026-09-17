/** Biome-ignore-all lint/style/noNonNullAssertion: unit tests */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Root } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2LintMessageVersion from "../src";

const messageToJson = (message: VFile["messages"][0]) =>
  // oxlint-disable-next-line unicorn/prefer-structured-clone
  JSON.parse(JSON.stringify(message));

describe("hl7v2-lint:message-version", () => {
  it("should have no issues for a supported version within range", async () => {
    // GIVEN
    const hl7v2 = m(
      s(
        "MSH",
        // 1..11 arbitrary fields
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f("ADT^A01"),
        f("MSG00001"),
        f("P"),
        // 12: version in supported range
        f("2.5")
      )
    );

    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(0);
  });

  it("errors when node is not a root message", async () => {
    const notRoot = s("MSH", f("|"), f("^~\\&"));

    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(notRoot, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: [notRoot],
      fatal: false,
      file: "",
      message: "Root node type must be 'root' — received 'segment' instead",
      name: "1:1",
      reason: "Root node type must be 'root' — received 'segment' instead",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors when MSH-12 is missing", async () => {
    const hl7v2 = m(
      s(
        "MSH",
        // only 11 fields, so MSH-12 is missing
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f("ADT^A01"),
        f("MSG00001"),
        f("P")
      )
    );
    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: [hl7v2],
      fatal: false,
      file: "",
      message: "Required MSH-12 (version) field is missing or empty",
      name: "1:1",
      reason: "Required MSH-12 (version) field is missing or empty",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors when MSH-12 is present but empty", async () => {
    const hl7v2 = m(
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
        f("ADT^A01"),
        f("MSG00001"),
        f("P"),
        // 12: empty value
        f()
      )
    );
    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: expect.any(Array),
      fatal: false,
      file: "",
      message: "Required MSH-12 (version) field is missing or empty",
      name: "1:1",
      reason: "Required MSH-12 (version) field is missing or empty",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors when MSH-12 is not a valid version", async () => {
    const hl7v2 = m(
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
        f("ADT^A01"),
        f("MSG00001"),
        f("P"),
        // invalid semver
        f("foo")
      )
    );
    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: expect.any(Array),
      cause: {
        input: "foo",
        name: "VersionParseError",
        reason: "expected format: major.minor.patch (e.g., '2.5.1' or '2.3')",
      },
      fatal: false,
      file: "",
      message: "MSH-12 (version) field value 'foo' is not valid",
      name: "1:1",
      reason: "MSH-12 (version) field value 'foo' is not valid",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors when version is outside supported range", async () => {
    const hl7v2 = m(
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
        f("ADT^A01"),
        f("MSG00001"),
        f("P"),
        // below minimum supported 2.3
        f("2.2")
      )
    );
    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: expect.any(Array),
      fatal: false,
      file: "",
      message:
        "MSH-12 (version) field value '2.2' does not satisfy expression '<3.0.0 >=2.3'",
      name: "1:1",
      reason:
        "MSH-12 (version) field value '2.2' does not satisfy expression '<3.0.0 >=2.3'",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("respects a custom expression option", async () => {
    const hl7v2 = m(
      s(
        "MSH",
        f("|"),
        f("^\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f("ADT^A01"),
        f("MSG00001"),
        f("P"),
        // 12: version that is below the default minimum (2.3),
        // but allowed by a custom expression starting at 2.2
        f("2.2")
      )
    );
    // WHEN
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    // THEN
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: expect.any(Array),
      fatal: false,
      file: "",
      message:
        "MSH-12 (version) field value '2.2' does not satisfy expression '<3.0.0 >=2.3'",
      name: "1:1",
      reason:
        "MSH-12 (version) field value '2.2' does not satisfy expression '<3.0.0 >=2.3'",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors with correct position of segment MSH-12 when MSH-12 is empty", async () => {
    const ast = await readFile(
      path.join(__dirname, "fixtures", "oru-ast-empty.json"),
      "utf8"
    );

    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(JSON.parse(ast), file);

    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: expect.any(Array),
      column: 274,
      fatal: false,
      file: "",
      line: 1,
      message: "Required MSH-12 (version) field is missing or empty",
      name: "1:274-1:274",
      place: {
        end: {
          column: 274,
          line: 1,
          offset: 273,
        },
        start: {
          column: 274,
          line: 1,
          offset: 273,
        },
      },
      reason: "Required MSH-12 (version) field is missing or empty",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  it("errors with correct position of segment MSH when MSH-12 is missing", async () => {
    const raw = await readFile(
      path.join(__dirname, "fixtures", "oru-ast-missing.json"),
      "utf8"
    );
    const ast = JSON.parse(raw) as Root;

    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(ast, file);

    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toStrictEqual({
      ancestors: [ast],
      fatal: false,
      file: "",
      message: "Required MSH-12 (version) field is missing or empty",
      name: "1:1",
      reason: "Required MSH-12 (version) field is missing or empty",
      ruleId: "message-version",
      source: "hl7v2-lint",
      url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-message-version#readme",
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("extracts version from composite VID in MSH-12 (2.5^USA^ISO)", async () => {
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

    const hl7v2 = m(mshVid("2.5"));
    const file = new VFile();
    await unified().use([hl7v2LintMessageVersion]).run(hl7v2, file);

    expect(file.messages).toHaveLength(0);
  });
});

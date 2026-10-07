import { f, g, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2LintRequiredMessageHeader from "../src";

describe("hl7v2-lint:required-message-header", () => {
  it("should have no issues when message header MSH segment is present", async () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&")),
      s("PID", f("hello")),
      s("OBX", f("1"))
    );
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("should have no issues when MSH is the first segment in a group", async () => {
    const tree = m(
      g("GROUP", s("MSH", f("|"), f("^~\\&")), s("PID", f("hello")))
    );
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("warns when message header MSH segment is missing", async () => {
    const tree = m(s("PID", f("hello")), s("OBX", f("1")));
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toContain(
      "Message header (MSH) segment is required as the first segment — received 'PID' instead"
    );
  });

  it("warns when first segment in a group is not MSH", async () => {
    const tree = m(g("GROUP", s("PID", f("hello")), s("OBX", f("1"))));
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toContain(
      "Message header (MSH) segment is required as the first segment — received 'PID' instead"
    );
  });

  it("should have no issues when MSH is before groups", async () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&")),
      g("PATIENT", s("PID", f("hello")), s("OBX", f("1")))
    );
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("should have no issues when MSH is the first segment in a nested group", async () => {
    const tree = m(
      g(
        "GROUP",
        s("MSH", f("|"), f("^~\\&")),
        g("PATIENT", s("PID", f("hello")), s("OBX", f("1")))
      )
    );
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("warns when MSH is not the first segment", async () => {
    const tree = m(
      s("PID", f("hello")),
      s("MSH", f("|"), f("^~\\&")),
      s("OBX", f("1"))
    );
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toContain(
      "Message header (MSH) segment is required as the first segment — received 'PID' instead"
    );
  });

  it("names an empty Segment ID in the report", async () => {
    const tree = m(s("", f("A"), f("B")));
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.message).toBe(
      "Message header (MSH) segment is required as the first segment — received a segment with an empty Segment ID instead"
    );
  });
});

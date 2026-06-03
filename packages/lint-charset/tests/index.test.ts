import type { Field, Root } from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2LintCharset from "../src";

const messageToJson = (message: VFile["messages"][number] | undefined) =>
  // oxlint-disable-next-line unicorn/prefer-structured-clone
  JSON.parse(JSON.stringify(message));

/** Build a message whose MSH segment carries the given MSH-18 field. */
function messageWithCharsetField(charsetField: Field): Root {
  return m(
    s(
      "MSH",
      f("|"), // MSH-1
      f("^~\\&"), // MSH-2
      f("SENDER"), // MSH-3
      f("FAC"), // MSH-4
      f("RCVR"), // MSH-5
      f("FAC"), // MSH-6
      f("20250101010101"), // MSH-7
      f(""), // MSH-8
      f("ADT^A01"), // MSH-9
      f("MSG00001"), // MSH-10
      f("P"), // MSH-11
      f("2.5"), // MSH-12
      f(), // MSH-13
      f(), // MSH-14
      f(), // MSH-15
      f(), // MSH-16
      f(), // MSH-17
      charsetField // MSH-18
    )
  );
}

const messageWithCharset = (charset: string) =>
  messageWithCharsetField(f(charset));

async function run(
  tree: Root,
  options?: { allow?: readonly string[]; required?: boolean }
) {
  const file = new VFile();
  await unified()
    .use(options ? [[hl7v2LintCharset, options]] : [hl7v2LintCharset])
    .run(tree, file);
  return file;
}

describe("hl7v2-lint:charset", () => {
  it("has no issues for the default UTF-8 charset", async () => {
    const file = await run(messageWithCharset("UNICODE UTF-8"));
    expect(file.messages).toHaveLength(0);
  });

  it("accepts ASCII case-insensitively (a 7-bit UTF-8 subset)", async () => {
    const file = await run(messageWithCharset("ascii"));
    expect(file.messages).toHaveLength(0);
  });

  it("accepts ISO IR6 (the ASCII graphic set)", async () => {
    const file = await run(messageWithCharset("ISO IR6"));
    expect(file.messages).toHaveLength(0);
  });

  it("accepts a lower-cased UTF-8 code after normalization", async () => {
    const file = await run(messageWithCharset("unicode utf-8"));
    expect(file.messages).toHaveLength(0);
  });

  it("trims surrounding whitespace before comparing", async () => {
    const file = await run(messageWithCharset("  UNICODE UTF-8  "));
    expect(file.messages).toHaveLength(0);
  });

  it("has no issues when MSH-18 is absent (implies the ASCII default)", async () => {
    const file = await run(m(s("MSH", f("|"), f("^~\\&"))));
    expect(file.messages).toHaveLength(0);
  });

  it("has no issues when MSH-18 is present but empty", async () => {
    const file = await run(messageWithCharsetField(f("")));
    expect(file.messages).toHaveLength(0);
  });

  it("flags a non-UTF-8 single-byte charset (8859/1)", async () => {
    const file = await run(messageWithCharset("8859/1"));
    expect(file.messages).toHaveLength(1);
    expect(messageToJson(file.messages[0])).toMatchObject({
      reason:
        "MSH-18 (character set) value '8859/1' is not allowed (allowed: UNICODE UTF-8, ASCII, ISO IR6)",
      ruleId: "charset",
      source: "hl7v2-lint",
    });
  });

  it("flags UNICODE UTF-16 (a real table-0211 code the decoder rejects)", async () => {
    const file = await run(messageWithCharset("UNICODE UTF-16"));
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.reason).toContain("UNICODE UTF-16");
  });

  it("flags a bare UNICODE code (no transformation format)", async () => {
    const file = await run(messageWithCharset("UNICODE"));
    expect(file.messages).toHaveLength(1);
  });

  it("flags a near-miss spelling that is not a table-0211 code (UTF-8)", async () => {
    const file = await run(messageWithCharset("UTF-8"));
    expect(file.messages).toHaveLength(1);
  });

  it("flags only the incompatible repetition in a repeating MSH-18", async () => {
    const tree = messageWithCharsetField(
      f(r(c("UNICODE UTF-8")), r(c("8859/1")))
    );
    const file = await run(tree);
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.reason).toContain("8859/1");
    expect(file.messages[0]?.reason).not.toContain("UNICODE UTF-8'");
  });

  it("flags every incompatible repetition", async () => {
    const tree = messageWithCharsetField(f(r(c("8859/1")), r(c("BIG-5"))));
    const file = await run(tree);
    expect(file.messages).toHaveLength(2);
  });

  it("respects a custom allow-list", async () => {
    const file = await run(messageWithCharset("8859/1"), { allow: ["8859/1"] });
    expect(file.messages).toHaveLength(0);
  });

  it("flags a charset outside a custom allow-list", async () => {
    const file = await run(messageWithCharset("UNICODE UTF-8"), {
      allow: ["8859/1"],
    });
    expect(file.messages).toHaveLength(1);
  });

  it("falls back to the default allow-list when given an empty one", async () => {
    const passing = await run(messageWithCharset("UNICODE UTF-8"), {
      allow: [],
    });
    expect(passing.messages).toHaveLength(0);

    const failing = await run(messageWithCharset("8859/1"), { allow: [] });
    expect(failing.messages).toHaveLength(1);
  });

  it("ignores a non-root node without reporting", async () => {
    const notRoot = s("MSH", f("|"), f("^~\\&"));
    const file = new VFile();
    await unified().use([hl7v2LintCharset]).run(notRoot, file);
    expect(file.messages).toHaveLength(0);
  });

  it("flags a missing MSH-18 when required", async () => {
    const file = await run(m(s("MSH", f("|"), f("^~\\&"))), {
      required: true,
    });
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.reason).toContain("required");
  });

  it("flags an empty MSH-18 when required", async () => {
    const file = await run(messageWithCharsetField(f("")), { required: true });
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.reason).toContain("required");
  });

  it("accepts a declared charset when required", async () => {
    const file = await run(messageWithCharset("UNICODE UTF-8"), {
      required: true,
    });
    expect(file.messages).toHaveLength(0);
  });

  // The strict-mode middleware filters on `fatal === true`, which is the
  // severity the recommended preset registers this rule at.
  it("emits a fatal diagnostic at error severity", async () => {
    const file = new VFile();
    await unified()
      .use([[hl7v2LintCharset, ["error"]]])
      .run(messageWithCharset("8859/1"), file);
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.fatal).toBe(true);
  });

  it("emits a non-fatal diagnostic at warn severity", async () => {
    const file = new VFile();
    await unified()
      .use([[hl7v2LintCharset, ["warn"]]])
      .run(messageWithCharset("8859/1"), file);
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.fatal).toBe(false);
  });

  it("normalizes custom allow-list entries (trim + case-insensitive)", async () => {
    const file = await run(messageWithCharset("8859/1"), {
      allow: [" 8859/1 "],
    });
    expect(file.messages).toHaveLength(0);
  });

  it("reports each offending repetition's value and spares the allowed one", async () => {
    // Interleaved valid middle repetition guards the 1-based [index+1] read.
    const tree = messageWithCharsetField(
      f(r(c("UTF-8")), r(c("UNICODE UTF-8")), r(c("BIG-5")))
    );
    const file = await run(tree);
    const reasons = file.messages.map((message) => message.reason);
    expect(reasons).toHaveLength(2);
    expect(reasons.some((reason) => reason.includes("'UTF-8'"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("'BIG-5'"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("'UNICODE UTF-8'"))).toBe(
      false
    );
  });
});

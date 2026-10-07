import { f, g, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";

import hl7v2LintMaxMessageSize from "../src";

describe("hl7v2-lint:max-message-size", () => {
  it("should have no issues for a small message", async () => {
    const tree = m(s("PID"));
    const file = new VFile();

    await unified().use([hl7v2LintMaxMessageSize]).run(tree, file);

    expect(file.messages).toHaveLength(0);
  });

  it("warns when message size exceeds the limit", async () => {
    // Message size is ~440 bytes
    const tree = m(
      s("MSH", f("Welcome"), f("Test")),
      s("PID", f("1234567890")),
      s("OBX", f("1234567890")),
      s("OBR", f("1234567890"))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2LintMaxMessageSize, { maxBytes: 1 })
      .run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The message is 9 bytes; the configured limit is 1 byte. Shorten the message or raise `maxBytes`."
    );
    expect(file.messages[0].actual).toBe("9");
  });

  it("warns when message has too many segments", async () => {
    const tree = m(
      s("MSH", f("Welcome"), f("Test")),
      s("PID", f("1234567890")),
      s("OBX", f("1234567890"))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2LintMaxMessageSize, { maxSegments: 1 })
      .run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The message has 3 segments; the configured limit is 1 segment. Remove segments or raise `maxSegments`."
    );
    expect(file.messages[0].actual).toBe("3");
  });

  it("warns when message with groups has too many segments", async () => {
    const tree = m(
      s("MSH", f("Welcome"), f("Test")),
      g("PATIENT", s("PID", f("1234567890")), s("OBX", f("1234567890"))),
      g(
        "ORDER",
        s("ORC", f("1234567890")),
        g("RESULT", s("OBX", f("1234567890"))) // nest group
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2LintMaxMessageSize, { maxSegments: 2 })
      .run(tree, file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0].message).toBe(
      "The message has 5 segments; the configured limit is 2 segments. Remove segments or raise `maxSegments`."
    );
    expect(file.messages[0].actual).toBe("5");
  });

  it("warns when message has too many segments and size exceeds the limit", async () => {
    // Message size is ~440 bytes
    const tree = m(
      s("MSH", f("Welcome"), f("Test")),
      s("PID", f("1234567890")),
      s("OBX", f("1234567890"))
    );
    const file = new VFile();

    await unified()
      .use(hl7v2LintMaxMessageSize, { maxBytes: 1, maxSegments: 1 })
      .run(tree, file);

    expect(file.messages).toHaveLength(2);
    expect(file.messages[0].message).toBe(
      "The message is 9 bytes; the configured limit is 1 byte. Shorten the message or raise `maxBytes`."
    );
    expect(file.messages[0].actual).toBe("9");
    expect(file.messages[1].message).toBe(
      "The message has 3 segments; the configured limit is 1 segment. Remove segments or raise `maxSegments`."
    );
    expect(file.messages[1].actual).toBe("3");
  });
});

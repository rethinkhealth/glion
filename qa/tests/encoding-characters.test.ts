import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

const write = async (
  message: string,
  encodingCharacters?: { subcomponent: string }
): Promise<string> =>
  String(
    await unified()
      .use(hl7v2Parser, { encodingCharacters })
      .use(hl7v2ToHl7v2)
      .process(message)
  );

describe("the encoding characters option, from text to text", () => {
  it("writes MSH-2 declaring what the option fills, and the body with it", async () => {
    expect(
      await write("MSH|^~&|APP\rPID|1||a#b&F&c\r", { subcomponent: "#" })
    ).toBe("MSH|^~&#|APP\rPID|1||a#b&F&c\r");
  });

  it("reads back what it wrote without the option", async () => {
    const written = await write("MSH|^~&|APP\rPID|1||a#b&F&c\r", {
      subcomponent: "#",
    });

    expect(await write(written)).toBe(written);
  });
});

describe("an encoding character the option fills with another delimiter's character", () => {
  it("is written back in MSH-2, the same as a message that declares it", async () => {
    const written = await write("MSH|^~&|APP\rPID|1||a&F&b\r", {
      subcomponent: "&",
    });

    expect(written).toBe("MSH|^~&&|APP\rPID|1||a&F&b\r");
    expect(await write(written)).toBe(written);
  });
});

describe("a message without an escape character, from text to text", () => {
  it("is written back as given, with a control character in a value", async () => {
    expect(await write("MSH|^~\rNTE|a\tb&c\r")).toBe("MSH|^~\rNTE|a\tb&c\r");
  });
});

describe("an MSH later in a message, from text to text", () => {
  it.each([
    "BHS|^~\\&|X\rMSH|^~\\&|APP|FAC\rPID|1||a&b\r",
    "MSH|^~\\&|A\rPID|1\rMSH|^~\\&|B\r",
    "PID|1||a&b\rMSH|*$#@|A\r",
  ])("is written back as given: %j", async (message) => {
    expect(await write(message)).toBe(message);
  });
});

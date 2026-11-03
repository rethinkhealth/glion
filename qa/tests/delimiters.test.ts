import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

const write = async (message: string): Promise<string> =>
  String(await unified().use(hl7v2Parser).use(hl7v2ToHl7v2).process(message));

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

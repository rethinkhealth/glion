import type { Root } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/hl7v2";
import hl7v2LintRequiredMessageHeader from "@glion/lint-required-message-header";
import { hl7v2Parser } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError } from "@glion/util-charset";
import { unified } from "unified";
import type { Plugin } from "unified";

import { parseRequest, salvageHeader } from "../../src/server/request";

/** A unified parser plugin whose parse step throws `thrown`. */
function throwingParser(thrown: unknown): Plugin<[], string, Root> {
  return function parser() {
    this.parser = () => {
      throw thrown;
    };
  };
}

/** A unified plugin whose transformer throws `thrown`. */
function throwingTransformer(thrown: unknown): Plugin<[], Root> {
  return () => () => {
    throw thrown;
  };
}

const MSH =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";
const MESSAGE = [MSH, "PID|1||12345^^^MRN||Doe^John"].join("\r");
const BYTES = new TextEncoder().encode(MESSAGE);

/** `text` encoded as UTF-8, with the byte 0xFF, which is never UTF-8, at `at`. */
function withInvalidByte(text: string, at: number): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  return new Uint8Array([
    ...bytes.subarray(0, at),
    0xff,
    ...bytes.subarray(at),
  ]);
}

describe("parseRequest", () => {
  it("parses a UTF-8 payload with the processor", async () => {
    const request = await parseRequest(BYTES, parseHL7v2);

    expect(request.raw).toBe(MESSAGE);
    expect(String(request.file)).toBe(MESSAGE);
    expect(toHl7v2(request.tree)).toBe(MESSAGE);
  });

  it("runs the processor's transformers, leaving their messages on the file", async () => {
    const processor = unified()
      .use(hl7v2Parser)
      .use(hl7v2LintRequiredMessageHeader, ["error"]);

    const { file } = await parseRequest(
      new TextEncoder().encode("PID|1"),
      processor
    );
    expect(file.messages.map(({ fatal }) => fatal)).toEqual([true]);
  });

  it("throws the CharsetError of a payload that is not UTF-8", async () => {
    await expect(
      parseRequest(withInvalidByte(MESSAGE, MESSAGE.length - 1), parseHL7v2)
    ).rejects.toThrow(CharsetError);
  });

  it("throws what the parser throws", async () => {
    const thrown = new Error("parser failed");

    await expect(
      parseRequest(BYTES, unified().use(throwingParser(thrown)))
    ).rejects.toThrow(thrown);
  });

  it("throws what a transformer throws", async () => {
    const thrown = new Error("transformer failed");
    const processor = unified()
      .use(hl7v2Parser)
      .use(throwingTransformer(thrown));

    await expect(parseRequest(BYTES, processor)).rejects.toThrow(thrown);
  });
});

describe("salvageHeader", () => {
  it("reads the MSH alone", () => {
    expect(toHl7v2(salvageHeader(BYTES) ?? m())).toBe(MSH);
  });

  it("reads the MSH of a payload whose later segments are not UTF-8", () => {
    const header = salvageHeader(withInvalidByte(MESSAGE, MESSAGE.length - 1));

    expect(toHl7v2(header ?? m())).toBe(MSH);
  });

  it("reads a payload with no CR whole", () => {
    expect(toHl7v2(salvageHeader(new TextEncoder().encode(MSH)) ?? m())).toBe(
      MSH
    );
  });

  it("reads no MSH when the MSH is not UTF-8", () => {
    expect(
      salvageHeader(withInvalidByte(MESSAGE, MSH.indexOf("SendFac")))
    ).toBeUndefined();
  });

  it("reads no MSH from a payload that does not start with one", () => {
    expect(salvageHeader(new Uint8Array())).toBeUndefined();
    expect(
      salvageHeader(new TextEncoder().encode("PID|1\rMSH|^~\\&"))
    ).toBeUndefined();
  });
});

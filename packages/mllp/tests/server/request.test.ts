import type { Root } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError } from "@glion/util-charset";
import { unified } from "unified";
import type { Plugin } from "unified";

import { MllpServerError } from "../../src/errors";
import {
  messageHeader,
  readHeader,
  parseRequest,
} from "../../src/server/request";

/** A unified parser plugin whose parse step throws `thrown`. */
function throwingParser(thrown: unknown): Plugin<[], string, Root> {
  return function parser() {
    this.parser = () => {
      throw thrown;
    };
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
  it("parses a UTF-8 payload with the processor", () => {
    const request = parseRequest(BYTES, parseHL7v2);

    expect(request.raw).toBe(MESSAGE);
    expect(String(request.file)).toBe(MESSAGE);
    expect(toHl7v2(request.tree)).toBe(MESSAGE);
  });

  it("finds no MSH in a payload that does not start with one", () => {
    expect(
      messageHeader(parseRequest(new Uint8Array(), parseHL7v2).tree)
    ).toBeUndefined();
    expect(
      messageHeader(
        parseRequest(new TextEncoder().encode("PID|1"), parseHL7v2).tree
      )
    ).toBeUndefined();
  });

  it("throws INCOMPATIBLE_CHARSET, with the CharsetError as its cause, for a payload that is not UTF-8", () => {
    const read = () =>
      parseRequest(withInvalidByte(MESSAGE, MESSAGE.length - 1), parseHL7v2);

    expect(read).toThrow(MllpServerError);
    expect(read).toThrow(
      expect.objectContaining({
        cause: expect.any(CharsetError),
        code: "INCOMPATIBLE_CHARSET",
      })
    );
  });

  it("throws what the parser throws", () => {
    const thrown = new Error("parser failed");

    expect(() =>
      parseRequest(BYTES, unified().use(throwingParser(thrown)))
    ).toThrow(thrown);
  });
});

describe("readHeader", () => {
  it("reads the MSH alone", () => {
    expect(toHl7v2(readHeader(BYTES) ?? m())).toBe(MSH);
  });

  it("reads the MSH of a payload whose later segments are not UTF-8", () => {
    const header = readHeader(withInvalidByte(MESSAGE, MESSAGE.length - 1));

    expect(toHl7v2(header ?? m())).toBe(MSH);
  });

  it("reads a payload with no CR whole", () => {
    expect(toHl7v2(readHeader(new TextEncoder().encode(MSH)) ?? m())).toBe(MSH);
  });

  it("reads no MSH when the MSH is not UTF-8", () => {
    expect(
      readHeader(withInvalidByte(MESSAGE, MSH.indexOf("SendFac")))
    ).toBeUndefined();
  });

  it("reads no MSH from a payload that does not start with one", () => {
    expect(readHeader(new Uint8Array())).toBeUndefined();
    expect(
      readHeader(new TextEncoder().encode("PID|1\rMSH|^~\\&"))
    ).toBeUndefined();
  });
});

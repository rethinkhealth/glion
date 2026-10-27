import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError } from "@glion/util-charset";
import { value } from "@glion/util-query";
import { unified } from "unified";
import type { Plugin } from "unified";

import { MllpServerError } from "../../src/errors";
import { messageHeader, readRequest } from "../../src/server/request";

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

describe("readRequest", () => {
  it("reads a UTF-8 payload with the processor", () => {
    const request = readRequest(BYTES, parseHL7v2);

    expect(request.error).toBeUndefined();
    expect(request.bytes).toBe(BYTES);
    expect(request.raw).toBe(MESSAGE);
    expect(String(request.file)).toBe(MESSAGE);
    expect(toHl7v2(request.tree)).toBe(MESSAGE);
  });

  it("finds no MSH in a payload that does not start with one", () => {
    expect(
      messageHeader(readRequest(new Uint8Array(), parseHL7v2).tree)
    ).toBeUndefined();
    expect(
      messageHeader(
        readRequest(new TextEncoder().encode("PID|1"), parseHL7v2).tree
      )
    ).toBeUndefined();
  });

  it("reads a payload that is not UTF-8 as INCOMPATIBLE_CHARSET, with no text and only its MSH in the tree", () => {
    const request = readRequest(
      withInvalidByte(MESSAGE, MESSAGE.length - 1),
      parseHL7v2
    );

    expect(request.error).toBeInstanceOf(MllpServerError);
    expect((request.error as MllpServerError).code).toBe(
      "INCOMPATIBLE_CHARSET"
    );
    expect((request.error as MllpServerError).cause).toBeInstanceOf(
      CharsetError
    );
    expect(request.raw).toBe("");
    expect(toHl7v2(request.tree)).toBe(MSH);
  });

  it("reads the MSH of a payload that is not UTF-8, with U+FFFD for each byte that is not", () => {
    const request = readRequest(
      withInvalidByte(MESSAGE, MSH.indexOf("SendFac")),
      parseHL7v2
    );

    expect(request.tree.children).toHaveLength(1);
    expect(value(request.tree, "MSH.4")?.value).toBe("�SendFac");
    expect(value(request.tree, "MSH.10")?.value).toBe("MSG001");
  });

  it("keeps the parser's error, the text, and only the MSH in the tree, when the parser throws", () => {
    const thrown = new Error("parser failed");
    const request = readRequest(BYTES, unified().use(throwingParser(thrown)));

    expect(request.error).toBe(thrown);
    expect(request.raw).toBe(MESSAGE);
    expect(toHl7v2(request.tree)).toBe(MSH);
  });

  it("wraps a parser's throw that is not an Error", () => {
    const request = readRequest(
      BYTES,
      unified().use(throwingParser("parser failed"))
    );

    expect(request.error).toBeInstanceOf(Error);
    expect(request.error?.message).toBe("parser failed");
  });
});

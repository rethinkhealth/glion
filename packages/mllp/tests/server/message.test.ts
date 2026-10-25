import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError } from "@glion/util-charset";
import { value } from "@glion/util-query";
import { unified } from "unified";
import type { Plugin } from "unified";

import { MllpServerError } from "../../src/errors";
import { readMessage } from "../../src/server/message";

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

describe("readMessage", () => {
  it("reads a UTF-8 payload with the processor, and copies its MSH into the header", () => {
    const message = readMessage(BYTES, parseHL7v2);

    expect(message.error).toBeUndefined();
    expect(message.bytes).toBe(BYTES);
    expect(message.raw).toBe(MESSAGE);
    expect(String(message.file)).toBe(MESSAGE);
    expect(message.tree.children).toHaveLength(2);
    expect(toHl7v2(message.header)).toBe(MSH);
  });

  it("copies the MSH values only, so changes to the tree do not reach the header", () => {
    const message = readMessage(BYTES, parseHL7v2);
    const controlId = value(message.tree, "MSH.10")?.node;
    if (controlId?.type !== "subcomponent") {
      throw new Error("The sample message has no MSH-10.");
    }
    controlId.value = "CHANGED";

    expect(value(message.header, "MSH.10")?.value).toBe("MSG001");
    expect(JSON.stringify(message.header)).not.toContain("position");
  });

  it("gives a header with no segment to a payload that does not start with an MSH", () => {
    expect(readMessage(new Uint8Array(), parseHL7v2).header.children).toEqual(
      []
    );
    expect(
      readMessage(new TextEncoder().encode("PID|1"), parseHL7v2).header.children
    ).toEqual([]);
  });

  it("reads a payload that is not UTF-8 as INCOMPATIBLE_CHARSET, with no text and no tree", () => {
    const message = readMessage(
      withInvalidByte(MESSAGE, MESSAGE.length - 1),
      parseHL7v2
    );

    expect(message.error).toBeInstanceOf(MllpServerError);
    expect((message.error as MllpServerError).code).toBe(
      "INCOMPATIBLE_CHARSET"
    );
    expect((message.error as MllpServerError).cause).toBeInstanceOf(
      CharsetError
    );
    expect(message.raw).toBe("");
    expect(message.tree).toEqual({ children: [], type: "root" });
  });

  it("reads the header of a payload that is not UTF-8, with U+FFFD for each byte that is not", () => {
    const message = readMessage(
      withInvalidByte(MESSAGE, MSH.indexOf("SendFac")),
      parseHL7v2
    );

    expect(value(message.header, "MSH.4")?.value).toBe("�SendFac");
    expect(value(message.header, "MSH.10")?.value).toBe("MSG001");
  });

  it("keeps the parser's error and the text, with no tree, when the parser throws", () => {
    const thrown = new Error("parser failed");
    const message = readMessage(BYTES, unified().use(throwingParser(thrown)));

    expect(message.error).toBe(thrown);
    expect(message.raw).toBe(MESSAGE);
    expect(message.tree).toEqual({ children: [], type: "root" });
    expect(toHl7v2(message.header)).toBe(MSH);
  });

  it("wraps a parser's throw that is not an Error", () => {
    const message = readMessage(
      BYTES,
      unified().use(throwingParser("parser failed"))
    );

    expect(message.error).toBeInstanceOf(Error);
    expect(message.error?.message).toBe("parser failed");
  });
});

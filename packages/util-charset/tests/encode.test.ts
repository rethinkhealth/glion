import { decodeBytes, encodeBytes } from "../src/index";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("encodeBytes", () => {
  it("encodes text to UTF-8 bytes", () => {
    expect(encodeBytes("José")).toEqual(utf8("José"));
  });

  it("round-trips with decodeBytes", () => {
    const text =
      "MSH|^~\\&|S|F|R|F|20240101||ADT^A01|MSG001|P|2.5.1\rPID|1||x||José";
    expect(decodeBytes(encodeBytes(text))).toBe(text);
  });
});

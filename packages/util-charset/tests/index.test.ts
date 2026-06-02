import {
  decodeBytes,
  encodeBytes,
  IncompatibleCharsetError,
} from "../src/index";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("decodeBytes", () => {
  it("decodes UTF-8 bytes to text", () => {
    expect(decodeBytes(utf8("MSH|^~\\&|José"))).toBe("MSH|^~\\&|José");
  });

  it("strips a leading UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("MSH")]);
    expect(decodeBytes(bytes)).toBe("MSH");
  });

  it("throws IncompatibleCharsetError on non-UTF-8 bytes, not silent corruption", () => {
    // A lone 0xE9 ("é" in Latin-1) is invalid UTF-8.
    const bytes = Uint8Array.of(0x4a, 0x6f, 0x73, 0xe9);
    expect(() => decodeBytes(bytes)).toThrow(IncompatibleCharsetError);
    try {
      decodeBytes(bytes);
    } catch (error) {
      expect((error as IncompatibleCharsetError).code).toBe(
        "INCOMPATIBLE_CHARSET"
      );
    }
  });

  it("names a non-UTF-8 BOM in the error", () => {
    const utf16le = Uint8Array.of(0xff, 0xfe, 0x4d, 0x00, 0x53, 0x00);
    expect(() => decodeBytes(utf16le)).toThrow(/UTF-16LE/);
    const utf32be = Uint8Array.of(0x00, 0x00, 0xfe, 0xff, 0x00);
    expect(() => decodeBytes(utf32be)).toThrow(/UTF-32BE/);
  });
});

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

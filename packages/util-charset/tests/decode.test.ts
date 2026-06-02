import { CharsetError, decodeBytes } from "../src/index";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("decodeBytes", () => {
  it("decodes UTF-8 bytes to text", () => {
    expect(decodeBytes(utf8("MSH|^~\\&|José"))).toBe("MSH|^~\\&|José");
  });

  it("strips a leading UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("MSH")]);
    expect(decodeBytes(bytes)).toBe("MSH");
  });

  it("throws CharsetError on non-UTF-8 bytes, not silent corruption", () => {
    // A lone 0xE9 ("é" in Latin-1) is invalid UTF-8.
    const bytes = Uint8Array.of(0x4a, 0x6f, 0x73, 0xe9);
    expect(() => decodeBytes(bytes)).toThrow(CharsetError);
    try {
      decodeBytes(bytes);
    } catch (error) {
      expect((error as CharsetError).code).toBe("INCOMPATIBLE_CHARSET");
    }
  });

  it("rejects each non-UTF-8 BOM as a CharsetError naming the encoding", () => {
    const cases: Array<[Uint8Array, RegExp]> = [
      [Uint8Array.of(0xff, 0xfe, 0x4d, 0x00), /UTF-16LE/],
      [Uint8Array.of(0xfe, 0xff, 0x00, 0x4d), /UTF-16BE/],
      [Uint8Array.of(0xff, 0xfe, 0x00, 0x00), /UTF-32LE/],
      [Uint8Array.of(0x00, 0x00, 0xfe, 0xff), /UTF-32BE/],
    ];

    for (const [bytes, name] of cases) {
      let caught: unknown;
      try {
        decodeBytes(bytes);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CharsetError);
      expect((caught as CharsetError).code).toBe("INCOMPATIBLE_CHARSET");
      expect((caught as Error).message).toMatch(name);
    }
  });
});

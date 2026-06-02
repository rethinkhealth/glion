import iconv from "iconv-lite";

import { decodeBytes, encodeBytes } from "../src/index";

/**
 * Cross-checks against `iconv-lite`, an independent character-encoding library,
 * so the codec and its BOM constants are validated against an external source —
 * not only against themselves. `iconv-lite` is a dev-only oracle here; the
 * package itself stays dependency-free.
 */

const SAMPLES = [
  "MSH|^~\\&|SENDER",
  "PID|1||12345||José^John", // accented char → multi-byte UTF-8
  "café 🚑 日本語", // accent + emoji (surrogate pair) + CJK
];

describe("UTF-8 round-trip cross-checked with iconv-lite", () => {
  for (const sample of SAMPLES) {
    it(`encodes "${sample}" to the same bytes as iconv-lite`, () => {
      expect(encodeBytes(sample)).toEqual(
        new Uint8Array(iconv.encode(sample, "utf8"))
      );
    });

    it(`decodes iconv-lite's UTF-8 bytes for "${sample}"`, () => {
      expect(decodeBytes(new Uint8Array(iconv.encode(sample, "utf8")))).toBe(
        sample
      );
    });
  }
});

describe("non-UTF-8 BOM constants cross-checked with iconv-lite", () => {
  const cases = [
    ["utf-16be", "UTF-16BE"],
    ["utf-16le", "UTF-16LE"],
    ["utf-32be", "UTF-32BE"],
    ["utf-32le", "UTF-32LE"],
  ] as const;

  for (const [encoding, name] of cases) {
    it(`recognises the ${name} BOM iconv-lite emits for U+FEFF`, () => {
      // iconv-lite independently serializes U+FEFF; decodeBytes must reject the
      // resulting bytes as exactly that encoding.
      const bom = new Uint8Array(iconv.encode("﻿", encoding));
      expect(() => decodeBytes(bom)).toThrow(new RegExp(name));
    });
  }
});

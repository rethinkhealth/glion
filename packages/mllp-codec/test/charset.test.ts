/**
 * Charset-transparency pins for the codec.
 *
 * The codec is content-opaque: it scans raw bytes for VT (0x0B) and FS
 * (0x1C) and never decodes text. These tests pin two facts:
 *
 * 1. Any byte sequence in which those two values do not occur round-trips frame →
 *    unframe exactly, whatever charset produced it — including bytes that are
 *    NOT valid UTF-8. Character-set conversion is `@glion/util-charset`'s
 *    layer, above this codec.
 * 2. MLLP itself can only carry encodings whose encoded content never contains the
 *    byte values 0x0B / 0x1C. That holds for UTF-8 (those values never occur
 *    inside a multi-byte sequence — continuation bytes are ≥ 0x80), for
 *    single-byte charsets (ISO-8859-x, Windows-125x), and for the Japanese
 *    encodings (Shift-JIS trail bytes are ≥ 0x40; EUC-JP components are ≥ 0xA1;
 *    ISO-2022-JP uses 7-bit printable bytes plus ESC). It does NOT hold for
 *    UTF-16: its code units legitimately contain those byte values, so the
 *    protocol cannot delimit such content — and the failure is data-dependent
 *    (pure-ASCII UTF-16 sneaks through as 0x00-padded bytes; one character like
 *    U+010B corrupts the stream). frame() turns that into a loud, deterministic
 *    refusal at the source.
 */

import { describe, expect, it } from "vitest";

import { CR, frame, FS, unframe, VT } from "../src/index";

/** Pipe `chunks` through unframe(); collect payloads and the terminal error. */
async function unframeAll(
  chunks: Uint8Array[]
): Promise<{ payloads: Uint8Array[]; error: unknown }> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const reader = source.pipeThrough(unframe()).getReader();
  const payloads: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value: payload } = await reader.read();
      if (done) {
        return { error: null, payloads };
      }
      payloads.push(payload);
    }
  } catch (error) {
    return { error, payloads };
  }
}

function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    out.push(bytes.slice(i, Math.min(i + size, bytes.length)));
  }
  return out;
}

// Encoded-content fixtures. Each is the byte form a real charset produces;
// none contain 0x0B / 0x1C, several are invalid as UTF-8 — the codec must
// not care.
const MLLP_SAFE_CONTENT: [name: string, bytes: number[]][] = [
  // "café" in ISO-8859-1: a bare 0xE9 is NOT valid UTF-8.
  ["ISO-8859-1 (French)", [0x63, 0x61, 0x66, 0xe9]],
  // "€" in Windows-1252: a bare 0x80 is a UTF-8 continuation byte — invalid alone.
  ["Windows-1252", [0x80]],
  // Halfwidth katakana "ｱｲｳ" in Shift-JIS: single bytes in 0xA1–0xDF.
  ["Shift-JIS single-byte katakana", [0xb1, 0xb2, 0xb3]],
  // A two-byte Shift-JIS sequence with the MINIMUM trail byte (0x40) — the
  // closest Shift-JIS ever gets to the reserved range, still well above 0x1C.
  ["Shift-JIS two-byte (minimum trail byte)", [0x88, 0x40]],
  // Hiragana "あ" in EUC-JP: both bytes ≥ 0xA1.
  ["EUC-JP", [0xa4, 0xa2]],
  // ISO-2022-JP kanji mode: ESC $ B, ideographic space, ESC ( B. ESC is
  // 0x1B — numerically between VT (0x0B) and FS (0x1C) — and must pass
  // through untouched.
  [
    "ISO-2022-JP (ESC sequences)",
    [0x1b, 0x24, 0x42, 0x21, 0x21, 0x1b, 0x28, 0x42],
  ],
];

describe("charset transparency — MLLP-safe encodings round-trip exactly", () => {
  for (const [name, content] of MLLP_SAFE_CONTENT) {
    it(`round-trips ${name} bytes verbatim`, async () => {
      const bytes = new Uint8Array(content);
      const { payloads, error } = await unframeAll([frame(bytes)]);
      expect(error).toBeNull();
      expect(payloads).toEqual([bytes]);
    });
  }

  it("round-trips ISO-2022-JP delivered byte-by-byte (ESC split across reads)", async () => {
    const bytes = new Uint8Array([
      0x1b, 0x24, 0x42, 0x21, 0x21, 0x1b, 0x28, 0x42,
    ]);
    const { payloads, error } = await unframeAll(chunkBytes(frame(bytes), 1));
    expect(error).toBeNull();
    expect(payloads).toEqual([bytes]);
  });
});

describe("charset transparency — UTF-16 cannot cross MLLP", () => {
  it("frame() refuses UTF-16LE content whose code unit contains the VT byte value", () => {
    // "Aċ" in UTF-16LE: 'A' = 41 00, 'ċ' (U+010B) = 0B 01. The 0x0B byte is
    // half of a legitimate character, but on the wire it is indistinguishable
    // from a start-of-message marker — MLLP cannot carry this. The refusal is
    // deterministic and at the source; note pure-ASCII UTF-16 would sneak
    // through (0x00-padded), which is exactly why the contract is "re-encode
    // upstream", not "works until the first non-ASCII character".
    const utf16le = new Uint8Array([0x41, 0x00, 0x0b, 0x01]);
    expect(() => frame(utf16le)).toThrow(
      expect.objectContaining({ code: "RESERVED_CHARACTER" })
    );
  });

  it("inbound UTF-16LE content containing FS CR reads as a terminator (truncation, then loud failure)", async () => {
    // 'ജ' (U+0D1C) in UTF-16LE is the bytes 1C 0D — exactly the MLLP
    // terminator. A receiver cannot tell character halves from framing, so
    // the message truncates at that point and the bytes after it sit outside
    // any envelope: the codec emits the truncated payload, then errors with
    // UNEXPECTED_DATA. This is the protocol's inherent limit, not a codec
    // choice — the reason frame() refuses such content outbound.
    const wire = new Uint8Array([
      VT,
      0x41,
      0x00,
      0x1c,
      0x0d,
      0x42,
      0x00,
      FS,
      CR,
    ]);
    const { payloads, error } = await unframeAll([wire]);
    expect(payloads).toEqual([new Uint8Array([0x41, 0x00])]);
    expect(error).toMatchObject({ code: "UNEXPECTED_DATA" });
  });
});

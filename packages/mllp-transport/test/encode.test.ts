/**
 * Tests for `encode(payload)` — wraps an HL7v2 payload in the MLLP
 * frame envelope `<VT> payload <FS> <CR>`.
 *
 * HL7v2 Transport §2.3.1 forbids VT (0x0B) and FS (0x1C) inside the
 * payload (they're framing markers). CR (0x0D) is allowed — HL7v2
 * uses it as a segment terminator inside the message body.
 */

import { describe, expect, it } from "vitest";

import { encode, MLLP, MllpFramingError } from "../src/index";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("encode", () => {
  describe("Uint8Array input", () => {
    it("wraps the payload in VT and FS+CR", () => {
      const out = encode(new Uint8Array([0x41, 0x42, 0x43])); // "ABC"
      expect(out).toEqual(
        new Uint8Array([MLLP.VT, 0x41, 0x42, 0x43, MLLP.FS, MLLP.CR])
      );
    });

    it("handles an empty payload (still produces VT+FS+CR)", () => {
      const out = encode(new Uint8Array(0));
      expect(out).toEqual(new Uint8Array([MLLP.VT, MLLP.FS, MLLP.CR]));
    });

    it("allows CR bytes inside the payload (HL7v2 segment terminators)", () => {
      const msg = utf8("MSH|^~\\&|S|F|R|F||ACK^A01\rMSA|AA|MSG001");
      const out = encode(msg);
      expect(out[0]).toBe(MLLP.VT);
      expect(out.at(-2)).toBe(MLLP.FS);
      expect(out.at(-1)).toBe(MLLP.CR);
      // Round-trip the body: strip VT/FS/CR, expect the original bytes.
      expect(out.slice(1, -2)).toEqual(msg);
    });
  });

  describe("string input", () => {
    it("UTF-8 encodes the string and wraps it", () => {
      const out = encode("ABC");
      expect(out).toEqual(
        new Uint8Array([MLLP.VT, 0x41, 0x42, 0x43, MLLP.FS, MLLP.CR])
      );
    });

    it("UTF-8 encodes multi-byte characters correctly", () => {
      const out = encode("é"); // 0xC3 0xA9
      expect(out).toEqual(
        new Uint8Array([MLLP.VT, 0xc3, 0xa9, MLLP.FS, MLLP.CR])
      );
    });
  });

  describe("control-character validation", () => {
    it("throws EMBEDDED_CONTROL_CHAR when payload contains VT", () => {
      const bad = new Uint8Array([0x41, MLLP.VT, 0x42]);
      expect(() => encode(bad)).toThrow(MllpFramingError);
      try {
        encode(bad);
      } catch (error) {
        expect(error).toBeInstanceOf(MllpFramingError);
        expect((error as MllpFramingError).code).toBe("EMBEDDED_CONTROL_CHAR");
      }
    });

    it("throws EMBEDDED_CONTROL_CHAR when payload contains FS", () => {
      const bad = new Uint8Array([0x41, MLLP.FS, 0x42]);
      expect(() => encode(bad)).toThrow(MllpFramingError);
      try {
        encode(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("EMBEDDED_CONTROL_CHAR");
      }
    });

    it("does not throw when payload contains CR (allowed)", () => {
      const ok = new Uint8Array([0x41, MLLP.CR, 0x42]);
      expect(() => encode(ok)).not.toThrow();
    });

    it("validates after UTF-8 encoding when the input is a string", () => {
      // VT is 0x0B; this is a control character represented as a literal
      // byte in the string. The validation runs on encoded bytes.
      expect(() => encode("\u000B")).toThrow(MllpFramingError);
    });
  });
});

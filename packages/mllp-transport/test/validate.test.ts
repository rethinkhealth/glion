/**
 * Tests for `validate(payload)`. The library does not ship an
 * `encode` function (callers stream `FRAME_START`, payload,
 * `FRAME_END` directly to a socket writer to avoid copying). The
 * payload pre-check lives here as a standalone function.
 *
 * HL7v2 Transport §2.3.1 forbids VT (0x0B) and FS (0x1C) inside the
 * payload — they're framing markers. CR (0x0D) is allowed; HL7v2
 * uses it as the segment terminator.
 */

import { describe, expect, it } from "vitest";

import { FS, MllpFramingError, validate, VT } from "../src/index";

describe("validate", () => {
  describe("Uint8Array input", () => {
    it("returns silently for a payload with no reserved bytes", () => {
      expect(() => validate(new Uint8Array([0x41, 0x42, 0x43]))).not.toThrow();
    });

    it("returns silently for an empty payload", () => {
      expect(() => validate(new Uint8Array(0))).not.toThrow();
    });

    it("allows CR bytes inside the payload (HL7v2 segment terminators)", () => {
      expect(() =>
        validate(new Uint8Array([0x41, 0x0d, 0x42, 0x0d, 0x43]))
      ).not.toThrow();
    });

    it("throws EMBEDDED_CONTROL_CHAR when payload contains VT", () => {
      const bad = new Uint8Array([0x41, VT, 0x42]);
      expect(() => validate(bad)).toThrow(MllpFramingError);
      try {
        validate(bad);
      } catch (error) {
        expect(error).toBeInstanceOf(MllpFramingError);
        expect((error as MllpFramingError).code).toBe("EMBEDDED_CONTROL_CHAR");
      }
    });

    it("throws EMBEDDED_CONTROL_CHAR when payload contains FS", () => {
      const bad = new Uint8Array([0x41, FS, 0x42]);
      expect(() => validate(bad)).toThrow(MllpFramingError);
      try {
        validate(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("EMBEDDED_CONTROL_CHAR");
      }
    });
  });

  describe("string input", () => {
    it("UTF-8 encodes the string and validates the bytes", () => {
      expect(() => validate("MSH|^~\\&|...")).not.toThrow();
    });

    it("allows multi-byte UTF-8 characters", () => {
      expect(() => validate("é")).not.toThrow();
    });

    it("throws when the encoded string contains VT", () => {
      // 0x0B is the VT byte.
      expect(() => validate("")).toThrow(MllpFramingError);
    });
  });
});

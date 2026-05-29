/**
 * Tests for `validate(payload)` — the pre-flight check used by
 * `frame()` and available standalone for callers that want to fail
 * early without allocating the framed output.
 */

import { describe, expect, it } from "vitest";

import { FramingError, FS, validate, VT } from "../src/index";

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

    it("throws EMBEDDED_CONTROL_CHAR on embedded VT", () => {
      const bad = new Uint8Array([0x41, VT, 0x42]);
      expect(() => validate(bad)).toThrowError(
        expect.objectContaining({
          code: "EMBEDDED_CONTROL_CHAR",
          name: "FramingError",
        })
      );
    });

    it("throws EMBEDDED_CONTROL_CHAR on embedded FS", () => {
      const bad = new Uint8Array([0x41, FS, 0x42]);
      expect(() => validate(bad)).toThrowError(
        expect.objectContaining({ code: "EMBEDDED_CONTROL_CHAR" })
      );
    });

    it("error is an instance of FramingError", () => {
      try {
        validate(new Uint8Array([VT]));
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(FramingError);
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

    it("rejects strings whose UTF-8 encoding contains a reserved byte", () => {
      // U+000B is the VT byte.
      expect(() => validate("")).toThrow(FramingError);
    });
  });
});

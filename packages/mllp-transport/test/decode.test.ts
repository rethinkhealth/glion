/**
 * Tests for `decode(input)` — strict one-shot decode.
 *
 * Contract:
 * - Input MUST begin with VT.
 * - The first FS+CR pair MUST be at the last two bytes of the input.
 * - Embedded FS bytes (FS not followed by CR) are accepted as payload.
 */

import { describe, expect, it } from "vitest";

import { CR, decode, FramingError, FS, VT } from "../src/index";

const wrap = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

describe("decode", () => {
  describe("happy path", () => {
    it("returns the payload between VT and FS+CR", () => {
      expect(decode(wrap([0x41, 0x42, 0x43]))).toEqual(
        new Uint8Array([0x41, 0x42, 0x43])
      );
    });

    it("returns an empty array for an empty payload", () => {
      expect(decode(new Uint8Array([VT, FS, CR]))).toEqual(new Uint8Array(0));
    });

    it("preserves CR bytes inside the payload (segment terminators)", () => {
      expect(decode(wrap([0x41, CR, 0x42]))).toEqual(
        new Uint8Array([0x41, CR, 0x42])
      );
    });

    it("treats embedded FS-not-followed-by-CR as payload content (lenient)", () => {
      // The first FS at offset 2 is NOT followed by CR; scan continues
      // and finds the real terminator at offset 4. Payload includes
      // the embedded FS — matches Mirth Connect / HAPI behaviour.
      const input = new Uint8Array([VT, 0x41, FS, 0x42, FS, CR]);
      expect(decode(input)).toEqual(new Uint8Array([0x41, FS, 0x42]));
    });
  });

  describe("malformed input", () => {
    it("throws MISSING_START_BLOCK when the first byte is not VT", () => {
      expect(() => decode(new Uint8Array([0x41, FS, CR]))).toThrowError(
        expect.objectContaining({ code: "MISSING_START_BLOCK" })
      );
    });

    it("throws MISSING_START_BLOCK on empty input", () => {
      expect(() => decode(new Uint8Array(0))).toThrowError(
        expect.objectContaining({ code: "MISSING_START_BLOCK" })
      );
    });

    it("throws MISSING_END_BLOCK when no FS+CR pair is present", () => {
      expect(() => decode(new Uint8Array([VT, 0x41, 0x42]))).toThrowError(
        expect.objectContaining({ code: "MISSING_END_BLOCK" })
      );
    });

    it("throws MISSING_END_BLOCK when FS is the last byte", () => {
      expect(() => decode(new Uint8Array([VT, 0x41, FS]))).toThrowError(
        expect.objectContaining({ code: "MISSING_END_BLOCK" })
      );
    });

    it("throws MISSING_END_BLOCK when trailing bytes appear after FS+CR", () => {
      // First FS+CR is at offset 2 but the input has 5 bytes;
      // the terminator is not at the end. Strict envelope rejects.
      expect(() =>
        decode(new Uint8Array([VT, 0x41, FS, CR, 0x42]))
      ).toThrowError(expect.objectContaining({ code: "MISSING_END_BLOCK" }));
    });

    it("error is a FramingError", () => {
      try {
        decode(new Uint8Array(0));
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(FramingError);
      }
    });
  });
});

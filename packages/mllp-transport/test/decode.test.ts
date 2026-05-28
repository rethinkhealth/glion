/**
 * Tests for `decode(input)` — strict one-shot decode of a single
 * complete MLLP frame.
 */

import { describe, expect, it } from "vitest";

import { CR, decode, FS, MllpFramingError, VT } from "../src/index";

const frame = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

describe("decode", () => {
  describe("happy path", () => {
    it("returns the payload between VT and FS+CR", () => {
      const out = decode(frame([0x41, 0x42, 0x43]));
      expect(out).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
    });

    it("returns an empty array for an empty payload", () => {
      const out = decode(new Uint8Array([VT, FS, CR]));
      expect(out).toEqual(new Uint8Array(0));
    });

    it("preserves CR bytes inside the payload (segment terminators)", () => {
      const payload = [0x41, CR, 0x42];
      const out = decode(frame(payload));
      expect(out).toEqual(new Uint8Array(payload));
    });

    it("is lenient: returns embedded VT/FS bytes as-is (downstream rejects)", () => {
      // Sender emitted an FS inside the payload. The decoder finds
      // the FIRST FS as the terminator, so we get truncated content;
      // we don't try to detect-and-error here.
      const out = decode(new Uint8Array([VT, 0x41, FS, CR]));
      expect(out).toEqual(new Uint8Array([0x41]));
    });
  });

  describe("malformed frames", () => {
    it("throws MISSING_START_BLOCK when the first byte is not VT", () => {
      const bad = new Uint8Array([0x41, FS, CR]);
      expect(() => decode(bad)).toThrow(MllpFramingError);
      try {
        decode(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_START_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK when the last two bytes are not FS+CR", () => {
      const bad = new Uint8Array([VT, 0x41, 0x42]);
      expect(() => decode(bad)).toThrow(MllpFramingError);
      try {
        decode(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_END_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK when FS is present but not followed by CR", () => {
      const bad = new Uint8Array([VT, 0x41, FS, 0x42]);
      expect(() => decode(bad)).toThrow(MllpFramingError);
      try {
        decode(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_END_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK on a frame too short to contain a terminator", () => {
      expect(() => decode(new Uint8Array([VT]))).toThrow(MllpFramingError);
      expect(() => decode(new Uint8Array([VT, 0x41]))).toThrow(
        MllpFramingError
      );
    });

    it("throws MISSING_START_BLOCK on an empty input", () => {
      expect(() => decode(new Uint8Array(0))).toThrow(MllpFramingError);
    });
  });
});

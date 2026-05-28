/**
 * Tests for `decodeOne(frame)` and `decodeStream(chunks)`.
 *
 * `decodeOne` parses exactly one complete MLLP frame and returns its
 * payload. `decodeStream` is a sync generator that consumes
 * arbitrarily-chunked bytes (as a TCP socket would deliver them) and
 * yields complete payloads as frames arrive.
 *
 * The decoder is **lenient**: it doesn't validate that the content
 * between VT and FS is free of control characters. Embedded VT/FS is a
 * spec violation by the sender; downstream parsers (e.g. the ACK
 * parser) will reject malformed payloads. The decoder's job is the
 * frame envelope, not the message content.
 */

import { describe, expect, it } from "vitest";

import { decodeOne, decodeStream, MLLP, MllpFramingError } from "../src/index";

const frame = (payload: number[]): Uint8Array =>
  new Uint8Array([MLLP.VT, ...payload, MLLP.FS, MLLP.CR]);

const collect = (chunks: Iterable<Uint8Array>): Uint8Array[] => [
  ...decodeStream(chunks),
];

describe("decodeOne", () => {
  describe("happy path", () => {
    it("returns the payload between VT and FS+CR", () => {
      const out = decodeOne(frame([0x41, 0x42, 0x43]));
      expect(out).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
    });

    it("returns an empty array for an empty payload", () => {
      const out = decodeOne(new Uint8Array([MLLP.VT, MLLP.FS, MLLP.CR]));
      expect(out).toEqual(new Uint8Array(0));
    });

    it("preserves CR bytes inside the payload (segment terminators)", () => {
      const payload = [0x41, MLLP.CR, 0x42];
      const out = decodeOne(frame(payload));
      expect(out).toEqual(new Uint8Array(payload));
    });
  });

  describe("malformed frames", () => {
    it("throws MISSING_START_BLOCK when the first byte is not VT", () => {
      const bad = new Uint8Array([0x41, MLLP.FS, MLLP.CR]);
      expect(() => decodeOne(bad)).toThrow(MllpFramingError);
      try {
        decodeOne(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_START_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK when the last two bytes are not FS+CR", () => {
      const bad = new Uint8Array([MLLP.VT, 0x41, 0x42]);
      expect(() => decodeOne(bad)).toThrow(MllpFramingError);
      try {
        decodeOne(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_END_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK when FS is present but not followed by CR", () => {
      const bad = new Uint8Array([MLLP.VT, 0x41, MLLP.FS, 0x42]);
      expect(() => decodeOne(bad)).toThrow(MllpFramingError);
      try {
        decodeOne(bad);
      } catch (error) {
        expect((error as MllpFramingError).code).toBe("MISSING_END_BLOCK");
      }
    });

    it("throws MISSING_END_BLOCK on a frame too short to contain a terminator", () => {
      // Just VT, no room for FS+CR.
      expect(() => decodeOne(new Uint8Array([MLLP.VT]))).toThrow(
        MllpFramingError
      );
      // VT + one byte — still no FS+CR pair.
      expect(() => decodeOne(new Uint8Array([MLLP.VT, 0x41]))).toThrow(
        MllpFramingError
      );
    });

    it("throws MISSING_START_BLOCK on an empty frame", () => {
      expect(() => decodeOne(new Uint8Array(0))).toThrow(MllpFramingError);
    });
  });
});

describe("decodeStream", () => {
  describe("complete frames in single chunks", () => {
    it("yields one payload per complete frame", () => {
      const out = collect([frame([0x41, 0x42])]);
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("yields nothing for empty input", () => {
      const out = collect([]);
      expect(out).toEqual([]);
    });

    it("yields nothing when input has no bytes at all", () => {
      const out = collect([new Uint8Array(0)]);
      expect(out).toEqual([]);
    });

    it("yields multiple payloads when multiple frames arrive in one chunk", () => {
      const a = frame([0x41]);
      const b = frame([0x42]);
      const combined = new Uint8Array(a.length + b.length);
      combined.set(a, 0);
      combined.set(b, a.length);

      const out = collect([combined]);
      expect(out).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });
  });

  describe("split frames across chunks", () => {
    it("reassembles a frame split mid-payload", () => {
      const out = collect([
        new Uint8Array([MLLP.VT, 0x41]),
        new Uint8Array([0x42, MLLP.FS, MLLP.CR]),
      ]);
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("reassembles a frame split between FS and CR", () => {
      const out = collect([
        new Uint8Array([MLLP.VT, 0x41, MLLP.FS]),
        new Uint8Array([MLLP.CR]),
      ]);
      expect(out).toEqual([new Uint8Array([0x41])]);
    });

    it("reassembles a frame split byte-by-byte", () => {
      const chunks: Uint8Array[] = [];
      const whole = frame([0x41, 0x42, 0x43]);
      for (let i = 0; i < whole.length; i++) {
        chunks.push(whole.slice(i, i + 1));
      }
      const out = collect(chunks);
      expect(out).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });

    it("yields the first frame mid-stream and reassembles the second across the boundary", () => {
      const out = collect([
        // First frame complete, second frame starts.
        new Uint8Array([MLLP.VT, 0x41, MLLP.FS, MLLP.CR, MLLP.VT, 0x42]),
        // Second frame finishes.
        new Uint8Array([MLLP.FS, MLLP.CR]),
      ]);
      expect(out).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });
  });

  describe("incomplete trailing data", () => {
    it("yields nothing when the buffer ends before a frame completes", () => {
      const out = collect([new Uint8Array([MLLP.VT, 0x41])]);
      expect(out).toEqual([]);
    });

    it("yields complete frames and drops a trailing partial frame", () => {
      const a = frame([0x41]);
      const partial = new Uint8Array([MLLP.VT, 0x42]);
      const combined = new Uint8Array(a.length + partial.length);
      combined.set(a, 0);
      combined.set(partial, a.length);

      const out = collect([combined]);
      expect(out).toEqual([new Uint8Array([0x41])]);
    });
  });

  describe("malformed input", () => {
    it("throws MISSING_START_BLOCK on garbage before a VT", () => {
      expect(() => collect([new Uint8Array([0xff, MLLP.VT, 0x41])])).toThrow(
        MllpFramingError
      );
    });

    it("throws MISSING_END_BLOCK when FS is not followed by CR", () => {
      expect(() =>
        collect([new Uint8Array([MLLP.VT, 0x41, MLLP.FS, 0x42, MLLP.CR])])
      ).toThrow(MllpFramingError);
    });
  });
});

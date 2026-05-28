/**
 * Tests for `FrameDecoder` — stateful push-based decoder that
 * mirrors the shape of `redis-parser` and `llhttp`.
 *
 * The decoder is **lenient** about payload content (embedded VT/FS
 * pass through; downstream parsers reject) and **strict** about
 * frame envelopes (garbage before VT throws; FS without CR throws).
 */

import { describe, expect, it } from "vitest";

import { CR, FrameDecoder, FS, MllpFramingError, VT } from "../src/index";

const frameBytes = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

describe("FrameDecoder", () => {
  describe("complete frames in single chunks", () => {
    it("returns one frame from one chunk", () => {
      const d = new FrameDecoder();
      const out = d.push(frameBytes([0x41, 0x42]));
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
      expect(d.buffered).toBe(0);
    });

    it("returns nothing for an empty chunk", () => {
      const d = new FrameDecoder();
      expect(d.push(new Uint8Array(0))).toEqual([]);
      expect(d.buffered).toBe(0);
    });

    it("returns multiple frames when several arrive in one chunk", () => {
      const d = new FrameDecoder();
      const a = frameBytes([0x41]);
      const b = frameBytes([0x42]);
      const combined = new Uint8Array(a.length + b.length);
      combined.set(a, 0);
      combined.set(b, a.length);

      expect(d.push(combined)).toEqual([
        new Uint8Array([0x41]),
        new Uint8Array([0x42]),
      ]);
      expect(d.buffered).toBe(0);
    });
  });

  describe("split frames across chunks", () => {
    it("reassembles a frame split mid-payload", () => {
      const d = new FrameDecoder();
      expect(d.push(new Uint8Array([VT, 0x41]))).toEqual([]);
      expect(d.buffered).toBe(2);
      expect(d.push(new Uint8Array([0x42, FS, CR]))).toEqual([
        new Uint8Array([0x41, 0x42]),
      ]);
      expect(d.buffered).toBe(0);
    });

    it("reassembles a frame split between FS and CR", () => {
      const d = new FrameDecoder();
      expect(d.push(new Uint8Array([VT, 0x41, FS]))).toEqual([]);
      expect(d.buffered).toBe(3);
      expect(d.push(new Uint8Array([CR]))).toEqual([new Uint8Array([0x41])]);
    });

    it("reassembles a frame split byte-by-byte", () => {
      const d = new FrameDecoder();
      const whole = frameBytes([0x41, 0x42, 0x43]);
      const collected: Uint8Array[] = [];
      for (let i = 0; i < whole.length; i++) {
        collected.push(...d.push(whole.slice(i, i + 1)));
      }
      expect(collected).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });

    it("yields the first frame mid-stream and buffers the second", () => {
      const d = new FrameDecoder();
      // First frame complete, second frame starts.
      expect(d.push(new Uint8Array([VT, 0x41, FS, CR, VT, 0x42]))).toEqual([
        new Uint8Array([0x41]),
      ]);
      expect(d.buffered).toBe(2);
      // Second frame finishes.
      expect(d.push(new Uint8Array([FS, CR]))).toEqual([
        new Uint8Array([0x42]),
      ]);
      expect(d.buffered).toBe(0);
    });
  });

  describe("incomplete trailing data", () => {
    it("buffers a partial frame and yields nothing", () => {
      const d = new FrameDecoder();
      expect(d.push(new Uint8Array([VT, 0x41]))).toEqual([]);
      expect(d.buffered).toBe(2);
    });

    it("yields complete frames and leaves the partial trailing frame buffered", () => {
      const d = new FrameDecoder();
      const a = frameBytes([0x41]);
      const partial = new Uint8Array([VT, 0x42]);
      const combined = new Uint8Array(a.length + partial.length);
      combined.set(a, 0);
      combined.set(partial, a.length);

      expect(d.push(combined)).toEqual([new Uint8Array([0x41])]);
      expect(d.buffered).toBe(partial.length);
    });
  });

  describe("malformed input", () => {
    it("throws MISSING_START_BLOCK on garbage before a VT", () => {
      const d = new FrameDecoder();
      expect(() => d.push(new Uint8Array([0xff, VT, 0x41]))).toThrow(
        MllpFramingError
      );
    });

    it("throws MISSING_END_BLOCK when FS is not followed by CR", () => {
      const d = new FrameDecoder();
      expect(() => d.push(new Uint8Array([VT, 0x41, FS, 0x42, CR]))).toThrow(
        MllpFramingError
      );
    });

    it("does not recover after a throw — caller must reset() or construct a new instance", () => {
      const d = new FrameDecoder();
      expect(() => d.push(new Uint8Array([0xff]))).toThrow(MllpFramingError);
      // Buffer still holds the bad byte; reset clears it.
      expect(d.buffered).toBeGreaterThan(0);
      d.reset();
      expect(d.buffered).toBe(0);
      expect(d.push(frameBytes([0x41]))).toEqual([new Uint8Array([0x41])]);
    });
  });
});

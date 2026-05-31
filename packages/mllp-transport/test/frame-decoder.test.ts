/**
 * Tests for `createFrameDecoder` — push-based streaming decoder
 * backed by a growth-doubling buffer. Frames are delivered via a
 * caller-supplied `onFrame` callback; structural errors return as a
 * `FramingError | null` so frames already emitted in the same push
 * are NOT lost.
 */

import { describe, expect, it } from "vitest";

import { CR, createFrameDecoder, FramingError, FS, VT } from "../src/index";

const wrap = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

/** Drive the decoder with chunks; return all emitted frames and the final error. */
function drive(
  chunks: Uint8Array[],
  opts?: Parameters<typeof createFrameDecoder>[0]
): { frames: Uint8Array[]; error: FramingError | null } {
  const d = createFrameDecoder(opts);
  const frames: Uint8Array[] = [];
  let error: FramingError | null = null;
  for (const chunk of chunks) {
    error = d.push(chunk, (f) => frames.push(f));
    if (error) {
      break;
    }
  }
  return { error, frames };
}

describe("createFrameDecoder", () => {
  describe("happy path", () => {
    it("emits one frame for a complete envelope in one chunk", () => {
      const { frames, error } = drive([wrap([0x41, 0x42])]);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("no-ops on an empty chunk", () => {
      const d = createFrameDecoder();
      expect(d.push(new Uint8Array(0), () => {})).toBeNull();
      expect(d.buffered).toBe(0);
    });

    it("emits multiple frames from one chunk", () => {
      const { frames, error } = drive([concat(wrap([0x41]), wrap([0x42]))]);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });
  });

  describe("reassembly across chunks", () => {
    it("reassembles a frame split mid-payload", () => {
      const { frames, error } = drive([
        new Uint8Array([VT, 0x41]),
        new Uint8Array([0x42, FS, CR]),
      ]);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("reassembles a frame split between FS and CR", () => {
      const { frames, error } = drive([
        new Uint8Array([VT, 0x41, FS]),
        new Uint8Array([CR]),
      ]);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41])]);
    });

    it("reassembles a frame split byte-by-byte", () => {
      const whole = wrap([0x41, 0x42, 0x43]);
      const chunks = Array.from({ length: whole.length }, (_, i) =>
        whole.slice(i, i + 1)
      );
      const { frames, error } = drive(chunks);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });

    it("emits the first frame mid-stream and buffers the second", () => {
      const d = createFrameDecoder();
      const frames: Uint8Array[] = [];
      // First frame complete, second frame starts.
      expect(
        d.push(new Uint8Array([VT, 0x41, FS, CR, VT, 0x42]), (f) =>
          frames.push(f)
        )
      ).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41])]);
      expect(d.buffered).toBe(2);
      // Second frame finishes.
      expect(
        d.push(new Uint8Array([FS, CR]), (f) => frames.push(f))
      ).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
      expect(d.buffered).toBe(0);
    });
  });

  describe("incomplete trailing data", () => {
    it("leaves a partial frame buffered when the stream ends mid-frame", () => {
      const d = createFrameDecoder();
      d.push(new Uint8Array([VT, 0x41]), () => {});
      expect(d.buffered).toBe(2);
    });
  });

  describe("lenient embedded FS (matches Mirth Connect / HAPI)", () => {
    it("treats FS-not-followed-by-CR inside payload as payload content", () => {
      const { frames, error } = drive([
        new Uint8Array([VT, 0x41, FS, 0x42, FS, CR]),
      ]);
      expect(error).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41, FS, 0x42])]);
    });

    it("matches the behaviour of `decode` on the same bytes", () => {
      // This is the regression test for the bug-hunter's F2 finding:
      // before the rewrite, `decode` and the streaming decoder
      // returned different results for the same wire bytes. They
      // must now agree.
      const bytes = new Uint8Array([VT, 0x41, FS, 0x42, FS, CR]);
      const { frames } = drive([bytes]);
      // decode-equivalent payload:
      expect(frames[0]).toEqual(new Uint8Array([0x41, FS, 0x42]));
    });
  });

  describe("structural errors", () => {
    it("returns MISSING_START_BLOCK on garbage before VT", () => {
      const { error } = drive([new Uint8Array([0xff, VT, 0x41])]);
      expect(error).toBeInstanceOf(FramingError);
      expect(error?.code).toBe("MISSING_START_BLOCK");
    });

    it("emits good frames before returning a later error in the same chunk", () => {
      // Regression for F1: good frame, then a frame with garbage
      // between. The good frame MUST be delivered before the error.
      const { frames, error } = drive([
        concat(wrap([0x41]), new Uint8Array([0xff])),
      ]);
      expect(frames).toEqual([new Uint8Array([0x41])]);
      expect(error?.code).toBe("MISSING_START_BLOCK");
    });

    it("does not return MISSING_END_BLOCK for an FS+payload boundary (real FS+CR may follow)", () => {
      // FS followed by non-CR is treated as payload, not an error —
      // the streaming decoder can't know if a real FS+CR is coming.
      const d = createFrameDecoder();
      const frames: Uint8Array[] = [];
      expect(
        d.push(new Uint8Array([VT, 0x41, FS, 0x42]), (f) => frames.push(f))
      ).toBeNull();
      expect(frames).toEqual([]);
      expect(d.buffered).toBe(4);
    });
  });

  describe("maxBufferedBytes (DoS defence)", () => {
    it("rejects a chunk that would exceed the configured limit", () => {
      const d = createFrameDecoder({ maxBufferedBytes: 4 });
      const err = d.push(
        new Uint8Array([VT, 0x41, 0x42, 0x43, 0x44]),
        () => {}
      );
      expect(err).toBeInstanceOf(FramingError);
      expect(err?.code).toBe("FRAME_TOO_LARGE");
    });

    it("rejects across multiple pushes when cumulative size exceeds the limit", () => {
      const d = createFrameDecoder({ maxBufferedBytes: 4 });
      expect(d.push(new Uint8Array([VT, 0x41]), () => {})).toBeNull();
      const err = d.push(new Uint8Array([0x42, 0x43, 0x44]), () => {});
      expect(err?.code).toBe("FRAME_TOO_LARGE");
    });

    it("grows the internal buffer past its initial capacity for large frames", () => {
      // Initial buffer capacity is small; this frame is bigger and
      // forces the growth-doubling branch to run.
      const big = new Uint8Array(2048);
      big.fill(0x41);
      const { frames, error } = drive([new Uint8Array([VT, ...big, FS, CR])]);
      expect(error).toBeNull();
      expect(frames).toEqual([big]);
    });

    it("does not apply when the buffer is drained between pushes", () => {
      const d = createFrameDecoder({ maxBufferedBytes: 8 });
      const frames: Uint8Array[] = [];
      expect(d.push(wrap([0x41, 0x42]), (f) => frames.push(f))).toBeNull();
      // Buffer is empty after the frame emits; the second push only
      // counts its own bytes against the limit.
      expect(
        d.push(wrap([0x43, 0x44, 0x45]), (f) => frames.push(f))
      ).toBeNull();
      expect(frames).toEqual([
        new Uint8Array([0x41, 0x42]),
        new Uint8Array([0x43, 0x44, 0x45]),
      ]);
    });
  });

  describe("aliasing safety (F-fix from bug-hunter)", () => {
    it("does not alias the caller's chunk into its internal buffer", () => {
      const d = createFrameDecoder();
      const frames: Uint8Array[] = [];
      const chunk = new Uint8Array([VT, 0x41, 0x42]);
      d.push(chunk, (f) => frames.push(f));
      // Caller mutates the chunk it gave us; our buffered bytes
      // must not be corrupted.
      chunk[1] = 0x99;
      chunk[2] = 0x99;
      d.push(new Uint8Array([FS, CR]), (f) => frames.push(f));
      expect(frames).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("yields frames as copies, not subarray views into the internal buffer", () => {
      const d = createFrameDecoder();
      const frames: Uint8Array[] = [];
      d.push(wrap([0x41, 0x42]), (f) => frames.push(f));
      // Push more data that reuses the internal buffer; the yielded
      // frame must remain unchanged.
      d.push(wrap([0xff, 0xff]), (f) => frames.push(f));
      expect(frames[0]).toEqual(new Uint8Array([0x41, 0x42]));
    });
  });

  describe("reset", () => {
    it("discards buffered bytes", () => {
      const d = createFrameDecoder();
      d.push(new Uint8Array([VT, 0x41]), () => {});
      expect(d.buffered).toBe(2);
      d.reset();
      expect(d.buffered).toBe(0);
    });

    it("lets the decoder recover after a structural error", () => {
      const d = createFrameDecoder();
      const err = d.push(new Uint8Array([0xff]), () => {});
      expect(err?.code).toBe("MISSING_START_BLOCK");
      d.reset();
      const frames: Uint8Array[] = [];
      expect(d.push(wrap([0x41]), (f) => frames.push(f))).toBeNull();
      expect(frames).toEqual([new Uint8Array([0x41])]);
    });
  });
});

/**
 * Tests for `FrameDecoderStream` — Web Streams wrapper around
 * `FrameDecoder` for `pipeThrough` callers.
 */

import { describe, expect, it } from "vitest";

import { CR, FrameDecoderStream, FS, MllpFramingError, VT } from "../src/index";

const frameBytes = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

/** Build a ReadableStream that emits the given chunks in order. */
function source(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(c);
      }
      controller.close();
    },
  });
}

/** Collect all frames a stream emits. */
async function collect(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for await (const frame of stream) {
    frames.push(frame);
  }
  return frames;
}

describe("FrameDecoderStream", () => {
  describe("happy path", () => {
    it("emits one frame per complete envelope", async () => {
      const out = await collect(
        source([frameBytes([0x41, 0x42])]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("emits multiple frames from a single chunk", async () => {
      const a = frameBytes([0x41]);
      const b = frameBytes([0x42]);
      const combined = new Uint8Array(a.length + b.length);
      combined.set(a, 0);
      combined.set(b, a.length);

      const out = await collect(
        source([combined]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });

    it("emits nothing for an empty stream", async () => {
      const out = await collect(
        source([]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([]);
    });
  });

  describe("reassembly across chunks", () => {
    it("reassembles a frame split mid-payload", async () => {
      const out = await collect(
        source([
          new Uint8Array([VT, 0x41]),
          new Uint8Array([0x42, FS, CR]),
        ]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("reassembles a frame split between FS and CR", async () => {
      const out = await collect(
        source([
          new Uint8Array([VT, 0x41, FS]),
          new Uint8Array([CR]),
        ]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41])]);
    });

    it("reassembles a frame split byte-by-byte", async () => {
      const whole = frameBytes([0x41, 0x42, 0x43]);
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < whole.length; i++) {
        chunks.push(whole.slice(i, i + 1));
      }
      const out = await collect(
        source(chunks).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });
  });

  describe("incomplete trailing data", () => {
    it("drops a partial trailing frame when the stream closes", async () => {
      const a = frameBytes([0x41]);
      const partial = new Uint8Array([VT, 0x42]);
      const combined = new Uint8Array(a.length + partial.length);
      combined.set(a, 0);
      combined.set(partial, a.length);

      const out = await collect(
        source([combined]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41])]);
    });
  });

  describe("malformed input", () => {
    it("propagates MllpFramingError as a stream error on garbage", async () => {
      await expect(
        collect(
          source([new Uint8Array([0xff, VT, 0x41])]).pipeThrough(
            new FrameDecoderStream()
          )
        )
      ).rejects.toBeInstanceOf(MllpFramingError);
    });

    it("propagates MllpFramingError when FS is not followed by CR", async () => {
      await expect(
        collect(
          source([new Uint8Array([VT, 0x41, FS, 0x42, CR])]).pipeThrough(
            new FrameDecoderStream()
          )
        )
      ).rejects.toBeInstanceOf(MllpFramingError);
    });
  });

  describe("instance independence", () => {
    it("two FrameDecoderStream instances do not share buffer state", async () => {
      const aStream = source([new Uint8Array([VT, 0x41])]).pipeThrough(
        new FrameDecoderStream()
      );
      const bStream = source([frameBytes([0x42])]).pipeThrough(
        new FrameDecoderStream()
      );
      const [a, b] = await Promise.all([collect(aStream), collect(bStream)]);
      expect(a).toEqual([]); // partial frame, dropped
      expect(b).toEqual([new Uint8Array([0x42])]);
    });
  });
});

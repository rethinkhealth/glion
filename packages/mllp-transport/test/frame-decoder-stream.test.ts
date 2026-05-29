/**
 * Tests for `FrameDecoderStream` — Web Streams wrapper around the
 * streaming decoder for `pipeThrough` callers.
 */

import { describe, expect, it } from "vitest";

import { CR, FrameDecoderStream, FramingError, FS, VT } from "../src/index";

const wrap = (payload: number[]): Uint8Array =>
  new Uint8Array([VT, ...payload, FS, CR]);

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

async function collect(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const frame of stream) {
    out.push(frame);
  }
  return out;
}

describe("FrameDecoderStream", () => {
  describe("happy path", () => {
    it("emits one frame per complete envelope", async () => {
      const out = await collect(
        source([wrap([0x41, 0x42])]).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("emits multiple frames from a single chunk", async () => {
      const a = wrap([0x41]);
      const b = wrap([0x42]);
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

    it("reassembles a frame split byte-by-byte", async () => {
      const whole = wrap([0x41, 0x42, 0x43]);
      const chunks = Array.from({ length: whole.length }, (_, i) =>
        whole.slice(i, i + 1)
      );
      const out = await collect(
        source(chunks).pipeThrough(new FrameDecoderStream())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });
  });

  describe("flush behaviour (no silent data loss)", () => {
    it("errors the stream when the writable side closes mid-frame", async () => {
      // Regression for the design-skeptic + bug-hunter finding: the
      // previous implementation silently dropped buffered bytes on
      // close. The new behaviour errors with MISSING_END_BLOCK.
      await expect(
        collect(
          source([new Uint8Array([VT, 0x41])]).pipeThrough(
            new FrameDecoderStream()
          )
        )
      ).rejects.toMatchObject({
        code: "MISSING_END_BLOCK",
        name: "FramingError",
      });
    });

    it("emits complete frames then errors when a partial trails them", async () => {
      const partial = new Uint8Array([VT, 0x42]);
      const a = wrap([0x41]);
      const combined = new Uint8Array(a.length + partial.length);
      combined.set(a, 0);
      combined.set(partial, a.length);

      const out: Uint8Array[] = [];
      const reader = source([combined])
        .pipeThrough(new FrameDecoderStream())
        .getReader();
      // Drain one frame, then expect the close to error.
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value).toEqual(new Uint8Array([0x41]));
      out.push(first.value as Uint8Array);
      await expect(reader.read()).rejects.toMatchObject({
        code: "MISSING_END_BLOCK",
      });
    });
  });

  describe("structural errors propagate as stream errors", () => {
    it("errors on garbage before VT", async () => {
      await expect(
        collect(
          source([new Uint8Array([0xff, VT, 0x41])]).pipeThrough(
            new FrameDecoderStream()
          )
        )
      ).rejects.toBeInstanceOf(FramingError);
    });
  });

  describe("maxBufferedBytes option propagates to the underlying decoder", () => {
    it("errors with FRAME_TOO_LARGE when the limit is exceeded", async () => {
      await expect(
        collect(
          source([new Uint8Array([VT, 0x41, 0x42, 0x43, 0x44])]).pipeThrough(
            new FrameDecoderStream({ maxBufferedBytes: 4 })
          )
        )
      ).rejects.toMatchObject({ code: "FRAME_TOO_LARGE" });
    });
  });

  describe("instance independence", () => {
    it("two streams do not share buffer state", async () => {
      // First stream gets a partial frame — should error on close.
      // Second stream gets a complete frame — should emit it.
      const [a, b] = await Promise.allSettled([
        collect(
          source([new Uint8Array([VT, 0x41])]).pipeThrough(
            new FrameDecoderStream()
          )
        ),
        collect(source([wrap([0x42])]).pipeThrough(new FrameDecoderStream())),
      ]);
      expect(a.status).toBe("rejected");
      expect(a.status === "rejected" && a.reason).toBeInstanceOf(FramingError);
      expect(b.status === "fulfilled" && b.value).toEqual([
        new Uint8Array([0x42]),
      ]);
    });
  });
});

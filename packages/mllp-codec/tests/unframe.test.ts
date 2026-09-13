/**
 * Tests for `unframe()` — the inbound half of the frame/unframe pair: a
 * TransformStream that turns wire bytes into complete MLLP payloads.
 *
 * Covers reassembly across chunk boundaries, the leniency/strictness split
 * (embedded lone FS is payload — Mirth / HAPI compat; an embedded VT is a
 * framing violation — frames can never glue), flush behaviour (no silent data
 * loss at end-of-stream), and the maxBufferedBytes DoS bound.
 */

import { describe, expect, it } from "vitest";

import { CR, MllpCodecError, FS, unframe, VT } from "../src/index";

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
  for await (const message of stream) {
    out.push(message);
  }
  return out;
}

describe("unframe", () => {
  describe("happy path", () => {
    it("emits one payload per complete envelope", async () => {
      const out = await collect(
        source([wrap([0x41, 0x42])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("emits multiple payloads from a single chunk", async () => {
      const a = wrap([0x41]);
      const b = wrap([0x42]);
      const combined = new Uint8Array(a.length + b.length);
      combined.set(a, 0);
      combined.set(b, a.length);

      const out = await collect(source([combined]).pipeThrough(unframe()));
      expect(out).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });

    it("emits an empty payload (VT FS CR with nothing between)", async () => {
      const out = await collect(
        source([new Uint8Array([VT, FS, CR])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array(0)]);
    });

    it("allows CR inside the payload (the HL7v2 segment terminator)", async () => {
      const out = await collect(
        source([wrap([0x41, CR, 0x42])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, CR, 0x42])]);
    });

    it("emits nothing for an empty stream", async () => {
      const out = await collect(source([]).pipeThrough(unframe()));
      expect(out).toEqual([]);
    });
  });

  describe("reassembly across chunks", () => {
    it("reassembles a payload split mid-frame", async () => {
      const out = await collect(
        source([
          new Uint8Array([VT, 0x41]),
          new Uint8Array([0x42, FS, CR]),
        ]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, 0x42])]);
    });

    it("reassembles a payload split byte-by-byte", async () => {
      const whole = wrap([0x41, 0x42, 0x43]);
      const chunks = Array.from({ length: whole.length }, (_, i) =>
        whole.slice(i, i + 1)
      );
      const out = await collect(source(chunks).pipeThrough(unframe()));
      expect(out).toEqual([new Uint8Array([0x41, 0x42, 0x43])]);
    });

    it("resumes a parked FS correctly after an earlier frame in the same chunk shifted the buffer", async () => {
      // One chunk carries a complete frame AND the start of the next, ending
      // on an FS. Emitting the first frame slides the in-progress frame to
      // offset 0 — the parked cursor must land on the FS's NEW position, so
      // the CR arriving next completes the second frame, not garbage.
      const first = wrap([0x41]);
      const combined = new Uint8Array([...first, VT, 0x42, FS]);
      const out = await collect(
        source([combined, new Uint8Array([CR])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41]), new Uint8Array([0x42])]);
    });

    it("ignores zero-byte chunks, including while parked on a trailing FS", async () => {
      // Some adapters yield a zero-byte read before EOF; it must be a no-op —
      // here it lands exactly while the decoder waits for the FS's successor.
      const out = await collect(
        source([
          new Uint8Array([VT, 0x41, FS]),
          new Uint8Array(0),
          new Uint8Array([CR]),
        ]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41])]);
    });

    it("reassembles a large payload trickled byte-by-byte (scan-watermark path)", async () => {
      // Exercises the resume-where-we-left-off scan across thousands of
      // pushes — including the FS/CR terminator pair split across the final
      // two — together with the buffer's doubling growth.
      const payload = Array.from({ length: 2048 }, (_, i) => 0x41 + (i % 26));
      const whole = wrap(payload);
      const chunks = Array.from({ length: whole.length }, (_, i) =>
        whole.slice(i, i + 1)
      );
      const out = await collect(source(chunks).pipeThrough(unframe()));
      expect(out).toEqual([new Uint8Array(payload)]);
    });
  });

  describe("embedded lone FS stays payload (Mirth / HAPI compat)", () => {
    it("treats FS not followed by CR as payload content", async () => {
      const out = await collect(
        source([wrap([0x41, FS, 0x42])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, FS, 0x42])]);
    });

    it("keeps a lone FS that immediately precedes the real terminator", async () => {
      // ... FS FS CR — the first FS's successor is FS (not CR), so it is
      // payload; the second FS pairs with the CR and terminates. The
      // emitted payload ends with the first FS.
      const out = await collect(
        source([new Uint8Array([VT, 0x41, FS, FS, CR])]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, FS])]);
    });

    it("re-examines an FS parked at a chunk boundary that turns out to be payload", async () => {
      // The FS is the last byte of its chunk — terminator or payload is
      // undecidable until the successor arrives. The next chunk starts with
      // a non-CR byte, so the parked FS resolves to payload content.
      const out = await collect(
        source([
          new Uint8Array([VT, 0x41, FS]),
          new Uint8Array([0x42, FS, CR]),
        ]).pipeThrough(unframe())
      );
      expect(out).toEqual([new Uint8Array([0x41, FS, 0x42])]);
    });
  });

  describe("embedded VT is a framing violation (frames can never glue)", () => {
    it("errors with RESERVED_CHARACTER on a VT inside a terminated frame", async () => {
      await expect(
        collect(source([wrap([0x41, VT, 0x42])]).pipeThrough(unframe()))
      ).rejects.toMatchObject({
        code: "RESERVED_CHARACTER",
        name: "MllpCodecError",
      });
    });

    it("errors eagerly when a new frame starts inside an unterminated one", async () => {
      // The glue case: a sender stalls mid-frame, then a fresh message
      // arrives. The error fires the moment the second VT is seen — not
      // when (if ever) a terminator shows up.
      await expect(
        collect(
          source([
            new Uint8Array([VT, 0x41]), // stalled, unterminated
            new Uint8Array([VT, 0x42, FS, CR]), // next message arrives
          ]).pipeThrough(unframe())
        )
      ).rejects.toMatchObject({ code: "RESERVED_CHARACTER" });
    });

    it("reports the violation at a stream-absolute offset, not a buffer-relative one", async () => {
      // A full frame is emitted and compacted away first, so the offending
      // VT sits at buffer offset 2 but STREAM offset 6 — the position an
      // operator would find in a packet capture. The error must name the
      // stream offset.
      await expect(
        collect(
          source([
            wrap([0x41]), // 4 bytes, emitted and compacted away
            new Uint8Array([VT, 0x42, VT]), // second VT at stream offset 6
          ]).pipeThrough(unframe())
        )
      ).rejects.toMatchObject({
        code: "RESERVED_CHARACTER",
        message: expect.stringContaining("stream offset 6"),
      });
    });

    it("errors on the second VT even when no terminator ever arrives", async () => {
      // Pins the EAGER property specifically: a check that ran only on
      // completed frames would never fire here — it would buffer garbage
      // until maxBufferedBytes while waiting for an FS+CR that never comes.
      await expect(
        collect(
          source([
            new Uint8Array([VT, 0x41]), // stalled, unterminated
            new Uint8Array([VT, 0x42]), // next message begins; still no FS+CR
          ]).pipeThrough(unframe())
        )
      ).rejects.toMatchObject({ code: "RESERVED_CHARACTER" });
    });
  });

  describe("parked FS resolved by a violation", () => {
    it("errors when the byte resolving a parked FS is a new frame's VT", async () => {
      // The nastiest interleaving: park on a trailing FS, and the successor
      // that arrives is a VT. The FS resolves to lone payload (successor is
      // not CR), and the VT is then caught as the embedded-frame violation —
      // eagerly, with no terminator anywhere in sight.
      await expect(
        collect(
          source([
            new Uint8Array([VT, 0x41, FS]),
            new Uint8Array([VT]),
          ]).pipeThrough(unframe())
        )
      ).rejects.toMatchObject({ code: "RESERVED_CHARACTER" });
    });
  });

  describe("garbage outside a frame", () => {
    it("errors with UNEXPECTED_DATA on bytes before the first VT", async () => {
      await expect(
        collect(
          source([new Uint8Array([0xff, VT, 0x41])]).pipeThrough(unframe())
        )
      ).rejects.toMatchObject({
        code: "UNEXPECTED_DATA",
        // Offset 0: the stream's very first byte is already outside a message.
        message: expect.stringContaining("stream offset 0"),
      });
    });

    it("reports the stream-absolute offset of inter-frame garbage", async () => {
      // One complete 4-byte frame (VT A FS CR), then garbage at offset 4.
      const reader = source([new Uint8Array([...wrap([0x41]), 0xff])])
        .pipeThrough(unframe())
        .getReader();
      await reader.read(); // the valid frame
      await expect(reader.read()).rejects.toMatchObject({
        code: "UNEXPECTED_DATA",
        message: expect.stringContaining("stream offset 4"),
      });
    });

    it("emits the complete frame, then errors on garbage between frames", async () => {
      const a = wrap([0x41]);
      const combined = new Uint8Array([...a, 0xff]);
      const reader = source([combined]).pipeThrough(unframe()).getReader();
      const first = await reader.read();
      expect(first.value).toEqual(new Uint8Array([0x41]));
      await expect(reader.read()).rejects.toMatchObject({
        code: "UNEXPECTED_DATA",
      });
    });
  });

  describe("flush behaviour (no silent data loss)", () => {
    it("errors with INCOMPLETE_MESSAGE when the stream ends mid-frame", async () => {
      await expect(
        collect(source([new Uint8Array([VT, 0x41])]).pipeThrough(unframe()))
      ).rejects.toMatchObject({
        code: "INCOMPLETE_MESSAGE",
        name: "MllpCodecError",
      });
    });

    it("errors with INCOMPLETE_MESSAGE at end-of-stream while parked on an FS", async () => {
      // The stream ends exactly while the decoder waits for the FS's
      // successor — still an unterminated frame, never silent data loss.
      await expect(
        collect(source([new Uint8Array([VT, 0x41, FS])]).pipeThrough(unframe()))
      ).rejects.toMatchObject({ code: "INCOMPLETE_MESSAGE" });
    });

    it("emits complete frames, then errors when a partial trails them", async () => {
      const a = wrap([0x41]);
      const combined = new Uint8Array([...a, VT, 0x42]);
      const reader = source([combined]).pipeThrough(unframe()).getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value).toEqual(new Uint8Array([0x41]));
      await expect(reader.read()).rejects.toMatchObject({
        code: "INCOMPLETE_MESSAGE",
      });
    });
  });

  describe("maxBufferedBytes (DoS defence)", () => {
    it("errors with MESSAGE_TOO_LARGE when the limit is exceeded", async () => {
      await expect(
        collect(
          source([new Uint8Array([VT, 0x41, 0x42, 0x43, 0x44])]).pipeThrough(
            unframe({ maxBufferedBytes: 4 })
          )
        )
      ).rejects.toMatchObject({ code: "MESSAGE_TOO_LARGE" });
    });

    it("counts carried-over bytes: an in-progress frame plus the next chunk exceeding the limit errors", async () => {
      await expect(
        collect(
          source([
            new Uint8Array([VT, 0x41]),
            new Uint8Array([0x42, 0x43, 0x44]),
          ]).pipeThrough(unframe({ maxBufferedBytes: 4 }))
        )
      ).rejects.toMatchObject({ code: "MESSAGE_TOO_LARGE" });
    });

    it("is a per-message bound, not a per-connection one: a drained buffer resets the budget", async () => {
      const out = await collect(
        source([wrap([0x41, 0x42]), wrap([0x43, 0x44, 0x45])]).pipeThrough(
          unframe({ maxBufferedBytes: 8 })
        )
      );
      expect(out).toEqual([
        new Uint8Array([0x41, 0x42]),
        new Uint8Array([0x43, 0x44, 0x45]),
      ]);
    });
  });

  describe("round-trip property (seeded, deterministic)", () => {
    it("reproduces every payload exactly across hundreds of random chunkings", async () => {
      // The powerful half of the engine's assertion story: random payload
      // sets (lone-FS-rich, CR-rich, empty payloads included) pushed through
      // random chunkings (1–7 byte chunks, empty chunks injected) must come
      // out exactly as they went in. This sweeps park/compaction/watermark
      // interleavings far beyond the hand-written pins. The seed is fixed —
      // a failure reproduces identically every run.
      //
      // Frames are built by hand, not via frame(): the outbound check
      // rejects lone FS, but the decoder deliberately ACCEPTS it inbound
      // (Mirth / HAPI leniency), so the round-trip domain is wider than
      // frame()'s. Excluded by construction: VT anywhere (inbound-illegal),
      // and FS immediately followed by CR inside a payload (reads as a
      // terminator — inherently ambiguous in MLLP, which has no escaping).
      let seed = 0xc0_ff_ee;
      const rand = (n: number): number => {
        // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-math-trunc -- the LCG must wrap to uint32; Math.trunc does not wrap and a negative seed would break `% n`
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed % n;
      };

      for (let round = 0; round < 200; round++) {
        const payloads = Array.from({ length: 1 + rand(4) }, () => {
          const payload = new Uint8Array(rand(40));
          for (let i = 0; i < payload.length; i++) {
            const previousWasFs = i > 0 && payload[i - 1] === FS;
            const pick = rand(8);
            if (pick === 0) {
              payload[i] = FS;
            } else if (pick === 1 && !previousWasFs) {
              payload[i] = CR;
            } else {
              payload[i] = 0x41 + rand(26);
            }
          }
          return payload;
        });

        const wire = new Uint8Array(
          payloads.flatMap((p) => [VT, ...p, FS, CR])
        );
        const chunks: Uint8Array[] = [];
        for (let at = 0; at < wire.length; ) {
          if (rand(10) === 0) {
            chunks.push(new Uint8Array(0));
          }
          const size = 1 + rand(7);
          chunks.push(wire.slice(at, at + size));
          at += size;
        }

        const out = await collect(source(chunks).pipeThrough(unframe()));
        expect(out).toEqual(payloads);
      }
    });
  });

  describe("instance independence", () => {
    it("two pipelines do not share buffer state", async () => {
      const [a, b] = await Promise.allSettled([
        collect(source([new Uint8Array([VT, 0x41])]).pipeThrough(unframe())),
        collect(source([wrap([0x42])]).pipeThrough(unframe())),
      ]);
      expect(a.status).toBe("rejected");
      expect(a.status === "rejected" && a.reason).toBeInstanceOf(
        MllpCodecError
      );
      expect(b.status === "fulfilled" && b.value).toEqual([
        new Uint8Array([0x42]),
      ]);
    });
  });
});

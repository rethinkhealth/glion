/**
 * Benchmarks for @glion/mllp-transport.
 *
 * Tracks performance of the four hot paths exposed by this package:
 *
 * - `frame()` — one-shot encoder.
 * - `decode()` — one-shot decoder.
 * - `validate()` — pure byte scan (cheapest path; baseline).
 * - `createFrameDecoder().push()` — streaming decoder under four workload shapes
 *   (best case, MTU-sized chunks, 1-byte worst case, coalesced frames).
 * - `FrameDecoderStream` — Web Streams wrapper overhead.
 *
 * The chunk-size sweep on the streaming decoder is the most useful
 * for regression detection: doubling-growth + O(N) scan should
 * stay amortised O(N) across all chunk shapes. A regression to
 * O(N²) (e.g. accidentally re-scanning from offset 0 of a copy or
 * concatenating buffers per chunk) will show up as a >10x slowdown
 * on the 1-byte case while the others stay constant.
 *
 * Run: pnpm bench
 */
import { bench, describe } from "vitest";

import {
  createFrameDecoder,
  decode,
  frame,
  FrameDecoderStream,
  validate,
} from "../src/index";

// ---------------------------------------------------------------------------
// Fixtures — HL7v2 payload sizes representative of real traffic
// ---------------------------------------------------------------------------

const TEXT = new TextEncoder();

function buildPayload(obxCount: number): Uint8Array {
  const segments = [
    "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ORU^R01|MSG001|P|2.5",
    "PID|1||12345||Doe^John^Q||19800101|M",
  ];
  for (let i = 1; i <= obxCount; i++) {
    segments.push(`OBX|${i}|NM|8302-2^Height^LN||${170 + i}|cm|150-200||||F`);
  }
  return TEXT.encode(segments.join("\r"));
}

// Approximate sizes after framing: 200 B, 2 KB, 20 KB, 200 KB, 2 MB.
// The small/medium/large set is generated as real-shaped HL7v2 (MSH + PID
// + N OBX segments). XL and XXL would take ~10 ms to build segment-by-
// segment; we tile the medium payload instead. The codec doesn't inspect
// payload content (only VT/FS bytes), so tiled bytes exercise the same
// memcpy / indexOf paths as freshly-built ones.
const SMALL_PAYLOAD = buildPayload(2);
const MEDIUM_PAYLOAD = buildPayload(30);
const LARGE_PAYLOAD = buildPayload(300);
const XL_PAYLOAD = tilePayload(MEDIUM_PAYLOAD, 200 * 1024);
const XXL_PAYLOAD = tilePayload(MEDIUM_PAYLOAD, 2 * 1024 * 1024);

const SMALL_FRAME = frame(SMALL_PAYLOAD);
const MEDIUM_FRAME = frame(MEDIUM_PAYLOAD);
const LARGE_FRAME = frame(LARGE_PAYLOAD);
const XL_FRAME = frame(XL_PAYLOAD);
const XXL_FRAME = frame(XXL_PAYLOAD);

function tilePayload(base: Uint8Array, targetSize: number): Uint8Array {
  const out = new Uint8Array(targetSize);
  for (let off = 0; off < targetSize; off += base.length) {
    out.set(base.subarray(0, Math.min(base.length, targetSize - off)), off);
  }
  return out;
}

function chunkBytes(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out.push(bytes.slice(i, Math.min(i + chunkSize, bytes.length)));
  }
  return out;
}

function concatFrames(f: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(f.length * count);
  for (let i = 0; i < count; i++) {
    out.set(f, f.length * i);
  }
  return out;
}

const MEDIUM_FRAME_64B_CHUNKS = chunkBytes(MEDIUM_FRAME, 64);
const MEDIUM_FRAME_1B_CHUNKS = chunkBytes(MEDIUM_FRAME, 1);
const TEN_MEDIUM_FRAMES = concatFrames(MEDIUM_FRAME, 10);

// Realistic socket-read chunk shapes for large messages: app-level reads
// are typically 8–64 KB on Node TCP sockets (not the 64 B from MTU-sized
// tests). 1-byte and 10-coalesced workloads are skipped at this scale:
// 1-byte would take hours and 10× a 2 MB frame would exceed the default
// 16 MiB maxBufferedBytes.
const XL_FRAME_8K_CHUNKS = chunkBytes(XL_FRAME, 8 * 1024);
const XL_FRAME_1K_CHUNKS = chunkBytes(XL_FRAME, 1024);
const XXL_FRAME_64K_CHUNKS = chunkBytes(XXL_FRAME, 64 * 1024);
const XXL_FRAME_8K_CHUNKS = chunkBytes(XXL_FRAME, 8 * 1024);

const NOOP = (_frame: Uint8Array): void => {
  // discard
};

// ---------------------------------------------------------------------------
// frame() — one-shot encoder
// ---------------------------------------------------------------------------

describe("frame() — encode by payload size", () => {
  bench("small payload (~200 B)", () => {
    frame(SMALL_PAYLOAD);
  });

  bench("medium payload (~2 KB)", () => {
    frame(MEDIUM_PAYLOAD);
  });

  bench("large payload (~20 KB)", () => {
    frame(LARGE_PAYLOAD);
  });

  bench("xl payload (~200 KB)", () => {
    frame(XL_PAYLOAD);
  });

  bench("xxl payload (~2 MB)", () => {
    frame(XXL_PAYLOAD);
  });
});

// ---------------------------------------------------------------------------
// decode() — one-shot decoder
// ---------------------------------------------------------------------------

describe("decode() — one-shot decode by frame size", () => {
  bench("small frame (~200 B)", () => {
    decode(SMALL_FRAME);
  });

  bench("medium frame (~2 KB)", () => {
    decode(MEDIUM_FRAME);
  });

  bench("large frame (~20 KB)", () => {
    decode(LARGE_FRAME);
  });

  bench("xl frame (~200 KB)", () => {
    decode(XL_FRAME);
  });

  bench("xxl frame (~2 MB)", () => {
    decode(XXL_FRAME);
  });
});

// ---------------------------------------------------------------------------
// validate() — pure byte scan
// ---------------------------------------------------------------------------

describe("validate() — scan by payload size", () => {
  bench("small payload (~200 B)", () => {
    validate(SMALL_PAYLOAD);
  });

  bench("medium payload (~2 KB)", () => {
    validate(MEDIUM_PAYLOAD);
  });

  bench("large payload (~20 KB)", () => {
    validate(LARGE_PAYLOAD);
  });

  bench("xl payload (~200 KB)", () => {
    validate(XL_PAYLOAD);
  });

  bench("xxl payload (~2 MB)", () => {
    validate(XXL_PAYLOAD);
  });
});

// ---------------------------------------------------------------------------
// createFrameDecoder().push() — four streaming workloads
// ---------------------------------------------------------------------------

describe("createFrameDecoder() — streaming workloads (~2 KB frame)", () => {
  bench("1 frame, 1 push (best case)", () => {
    const decoder = createFrameDecoder();
    decoder.push(MEDIUM_FRAME, NOOP);
  });

  bench("1 frame, 64-byte chunks (~32 pushes, MTU-like)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of MEDIUM_FRAME_64B_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });

  bench("1 frame, 1-byte chunks (worst case, catches O(N²) regressions)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of MEDIUM_FRAME_1B_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });

  bench("10 frames, 1 coalesced push (pipelined ~20 KB)", () => {
    const decoder = createFrameDecoder();
    decoder.push(TEN_MEDIUM_FRAMES, NOOP);
  });
});

// ---------------------------------------------------------------------------
// createFrameDecoder().push() — large-message workloads (200 KB / 2 MB)
// ---------------------------------------------------------------------------

describe("createFrameDecoder() — large messages (200 KB)", () => {
  bench("1 frame, 1 push", () => {
    const decoder = createFrameDecoder();
    decoder.push(XL_FRAME, NOOP);
  });

  bench("1 frame, 8 KB chunks (~25 pushes, typical socket recv)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of XL_FRAME_8K_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });

  bench("1 frame, 1 KB chunks (~200 pushes)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of XL_FRAME_1K_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });
});

describe("createFrameDecoder() — large messages (2 MB)", () => {
  bench("1 frame, 1 push", () => {
    const decoder = createFrameDecoder();
    decoder.push(XXL_FRAME, NOOP);
  });

  bench("1 frame, 64 KB chunks (~32 pushes, large-payload socket recv)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of XXL_FRAME_64K_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });

  bench("1 frame, 8 KB chunks (~256 pushes)", () => {
    const decoder = createFrameDecoder();
    for (const chunk of XXL_FRAME_8K_CHUNKS) {
      decoder.push(chunk, NOOP);
    }
  });
});

// ---------------------------------------------------------------------------
// FrameDecoderStream — Web Streams wrapper overhead
// ---------------------------------------------------------------------------

async function drainStream(input: Uint8Array): Promise<void> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(input);
      controller.close();
    },
  });
  for await (const _frame of source.pipeThrough(new FrameDecoderStream())) {
    // discard
  }
}

describe("FrameDecoderStream — Web Streams overhead", () => {
  bench("1 frame through TransformStream (~2 KB)", async () => {
    await drainStream(MEDIUM_FRAME);
  });

  bench("10 coalesced frames through TransformStream", async () => {
    await drainStream(TEN_MEDIUM_FRAMES);
  });

  bench("1 frame through TransformStream (~200 KB)", async () => {
    await drainStream(XL_FRAME);
  });

  bench("1 frame through TransformStream (~2 MB)", async () => {
    await drainStream(XXL_FRAME);
  });
});

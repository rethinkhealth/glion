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

// Approximate sizes after framing: 200 B, 2 KB, 20 KB.
const SMALL_PAYLOAD = buildPayload(2);
const MEDIUM_PAYLOAD = buildPayload(30);
const LARGE_PAYLOAD = buildPayload(300);

const SMALL_FRAME = frame(SMALL_PAYLOAD);
const MEDIUM_FRAME = frame(MEDIUM_PAYLOAD);
const LARGE_FRAME = frame(LARGE_PAYLOAD);

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
});

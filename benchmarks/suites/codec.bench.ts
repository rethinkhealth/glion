/**
 * MLLP codec benchmarks — frame/unframe codec throughput.
 *
 * The trickle case is the regression guard for the streaming decoder's
 * scan watermark: the engine must stay amortised O(N) when a frame arrives
 * in many small chunks. It forms a ratio pair with the single-chunk bench
 * over the SAME bytes — a rescan-per-chunk regression shows as the trickle
 * case blowing up while its partner stays flat. The full chunk-shape sweep
 * lives in lab/codec-chunk-sweep.bench.ts.
 */
import { frame, unframe } from "@glion/mllp-codec";
import { bench, describe } from "vitest";

import { MLLP_SMALL_MESSAGE } from "../fixtures/messages";
import { concatFrames, source, tilePayload } from "../fixtures/streams";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMALL_MESSAGE_BYTES = new TextEncoder().encode(MLLP_SMALL_MESSAGE);
const SMALL_FRAME = frame(SMALL_MESSAGE_BYTES);
const THOUSAND_SMALL_FRAMES = Array.from({ length: 1000 }, () => SMALL_FRAME);
const TEN_SMALL_FRAMES_COALESCED = [concatFrames(SMALL_FRAME, 10)];

const TWO_MB_PAYLOAD = tilePayload(SMALL_MESSAGE_BYTES, 2 * 1024 * 1024);

// One 64 KiB frame delivered in 64-byte chunks — ~1024 reads of a single
// growing frame, the shape where a rescan-per-chunk regression amplifies.
const TRICKLE_FRAME = frame(new Uint8Array(64 * 1024).fill(0x41));
const TRICKLE_CHUNKS: Uint8Array[] = [];
for (let i = 0; i < TRICKLE_FRAME.length; i += 64) {
  TRICKLE_CHUNKS.push(TRICKLE_FRAME.slice(i, i + 64));
}

async function drain(chunks: Uint8Array[]): Promise<void> {
  const reader = source(chunks).pipeThrough(unframe()).getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) {
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("mllp-codec", () => {
  bench("mllp-codec: frame small message (3 segments)", () => {
    frame(SMALL_MESSAGE_BYTES);
  });

  bench("mllp-codec: frame 2 MB payload", () => {
    frame(TWO_MB_PAYLOAD);
  });

  bench("mllp-codec: unframe 1000 small frames, one chunk each", async () => {
    await drain(THOUSAND_SMALL_FRAMES);
  });

  bench("mllp-codec: unframe 10 frames, 1 coalesced chunk", async () => {
    await drain(TEN_SMALL_FRAMES_COALESCED);
  });

  // Ratio pair: same bytes, one chunk vs ~1024 chunks. Warm read together —
  // the trickle case growing while this one stays flat is the O(N²) signature.
  bench("mllp-codec: unframe 64 KiB frame, one chunk", async () => {
    await drain([TRICKLE_FRAME]);
  });

  bench("mllp-codec: unframe 64 KiB frame trickled in 64 B chunks", async () => {
    await drain(TRICKLE_CHUNKS);
  });
});

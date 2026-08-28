/**
 * MLLP codec benchmarks — frame/unframe codec throughput.
 *
 * The trickle case is the regression guard for the streaming decoder's
 * scan watermark: the engine must stay amortised O(N) when a frame arrives
 * in many small chunks. A rescan-per-chunk regression shows up here as a
 * quadratic blow-up while the single-chunk cases stay flat.
 */
import { frame, unframe } from "@glion/mllp-codec";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMALL_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SMALL_MESSAGE_BYTES = new TextEncoder().encode(SMALL_MESSAGE);
const SMALL_FRAME = frame(SMALL_MESSAGE_BYTES);
const THOUSAND_SMALL_FRAMES = Array.from({ length: 1000 }, () => SMALL_FRAME);

// One 64 KiB frame delivered in 64-byte chunks — ~1024 reads of a single
// growing frame, the shape where a rescan-per-chunk regression amplifies.
const TRICKLE_FRAME = frame(new Uint8Array(64 * 1024).fill(0x41));
const TRICKLE_CHUNKS: Uint8Array[] = [];
for (let i = 0; i < TRICKLE_FRAME.length; i += 64) {
  TRICKLE_CHUNKS.push(TRICKLE_FRAME.slice(i, i + 64));
}

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

  bench("mllp-codec: unframe 1000 small frames, one chunk each", async () => {
    await drain(THOUSAND_SMALL_FRAMES);
  });

  bench("mllp-codec: unframe 64 KiB frame trickled in 64 B chunks", async () => {
    await drain(TRICKLE_CHUNKS);
  });
});

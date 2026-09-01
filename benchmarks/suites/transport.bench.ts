/**
 * MLLP transport benchmarks — frame/decode one-shots and the streaming
 * frame decoder.
 *
 * The single-push vs 64 B-chunk pair over the same bytes is the amortised
 * O(N) guard for the decoder's doubling-growth buffer: a regression to
 * rescanning or per-chunk concatenation shows as the chunked case blowing
 * up while single-push stays flat. The full workload sweep lives in
 * lab/transport-decoder-sweep.bench.ts.
 */
import { createFrameDecoder, decode, frame } from "@glion/mllp-transport";
import { bench, describe } from "vitest";

import { buildPayload, chunkBytes, tilePayload } from "../fixtures/streams";

// ---------------------------------------------------------------------------
// Fixtures — ~2 KB real-shaped payload, ~2 MB tiled payload
// ---------------------------------------------------------------------------

const MEDIUM_PAYLOAD = buildPayload(30);
const XXL_PAYLOAD = tilePayload(MEDIUM_PAYLOAD, 2 * 1024 * 1024);

const MEDIUM_FRAME = frame(MEDIUM_PAYLOAD);
const XXL_FRAME = frame(XXL_PAYLOAD);
const MEDIUM_FRAME_64B_CHUNKS = chunkBytes(MEDIUM_FRAME, 64);

const NOOP = (_frame: Uint8Array): void => {
  // discard
};

// Complete frames leave the decoder empty, so one decoder is safely
// reused across iterations — construction stays out of the sample.
const singlePushDecoder = createFrameDecoder();
const chunkedDecoder = createFrameDecoder();

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("mllp-transport", () => {
  bench("mllp-transport: frame 2 KB payload", () => {
    frame(MEDIUM_PAYLOAD);
  });

  bench("mllp-transport: frame 2 MB payload", () => {
    frame(XXL_PAYLOAD);
  });

  bench("mllp-transport: decode 2 KB frame", () => {
    decode(MEDIUM_FRAME);
  });

  bench("mllp-transport: decode 2 MB frame", () => {
    decode(XXL_FRAME);
  });

  // Ratio pair: same bytes, 1 push vs ~32 pushes.
  bench("mllp-transport: decoder push 2 KB frame, single push", () => {
    singlePushDecoder.push(MEDIUM_FRAME, NOOP);
  });

  bench("mllp-transport: decoder push 2 KB frame, 64 B chunks", () => {
    for (const chunk of MEDIUM_FRAME_64B_CHUNKS) {
      chunkedDecoder.push(chunk, NOOP);
    }
  });
});

/**
 * Lab sweep — @glion/mllp-codec frame/unframe under the full workload grid.
 *
 * Not CodSpeed-tracked: run with `pnpm bench:lab` while optimizing the
 * codec. The curated regression subset lives in suites/codec.bench.ts.
 *
 * - `frame()` — one-shot encoder (includes the reserved-byte scan).
 * - `unframe()` — the streaming decoder, under workload shapes from best-case
 *   single chunks to 1-byte trickles.
 *
 * The chunk-size sweep on `unframe()` is the most useful for regression
 * detection: the engine resumes its byte scan at a watermark, so cost must
 * stay amortised O(N) across all chunk shapes. A regression to O(N²) —
 * rescanning the buffered prefix per chunk, concatenating buffers, losing
 * the watermark — shows up as a blow-up on the trickle cases while the
 * single-chunk cases stay flat.
 *
 * Measured history (Apple Silicon, Node 22, 64 KiB frame in 64 B chunks):
 * the original rescan-per-chunk engine ran ~44.6 ops/s (22.4 ms mean); the
 * watermark fix brought it to ~269 ops/s; the single-cursor rewrite — which
 * also bounded the FS search to live bytes instead of letting `indexOf`
 * walk stale buffer capacity — reached ~1,040 ops/s (0.96 ms mean), ~23×
 * overall. The residual cost is Web Streams per-chunk overhead.
 */
import { frame, unframe } from "@glion/mllp-codec";
import { bench, describe } from "vitest";

import { hl7, ORU_R01_HEADER, oruObx, repeat } from "../fixtures/messages";
import {
  chunkBytes,
  concatFrames,
  source,
  tilePayload,
} from "../fixtures/streams";

// ---------------------------------------------------------------------------
// Fixtures — approximate sizes after framing: 300 B, 2 KB, 20 KB, 200 KB,
// 2 MB. XL and XXL tile the medium payload instead of building segments.
// ---------------------------------------------------------------------------

const TEXT = new TextEncoder();
const SMALL_PAYLOAD = TEXT.encode(hl7(...ORU_R01_HEADER));
const MEDIUM_PAYLOAD = TEXT.encode(
  hl7(...ORU_R01_HEADER, ...repeat(oruObx, 30))
);
const LARGE_PAYLOAD = TEXT.encode(
  hl7(...ORU_R01_HEADER, ...repeat(oruObx, 300))
);
const XL_PAYLOAD = tilePayload(MEDIUM_PAYLOAD, 200 * 1024);
const XXL_PAYLOAD = tilePayload(MEDIUM_PAYLOAD, 2 * 1024 * 1024);

const SMALL_FRAME = frame(SMALL_PAYLOAD);
const MEDIUM_FRAME = frame(MEDIUM_PAYLOAD);
const XL_FRAME = frame(XL_PAYLOAD);
const XXL_FRAME = frame(XXL_PAYLOAD);

const MEDIUM_FRAME_64B_CHUNKS = chunkBytes(MEDIUM_FRAME, 64);
const MEDIUM_FRAME_1B_CHUNKS = chunkBytes(MEDIUM_FRAME, 1);
const TEN_MEDIUM_FRAMES_COALESCED = [concatFrames(MEDIUM_FRAME, 10)];
const THOUSAND_SMALL_FRAMES = Array.from({ length: 1000 }, () => SMALL_FRAME);

// The watermark guard: one 64 KiB frame delivered in 64-byte chunks — 1024
// pushes of a single growing frame, the shape where a rescan-per-chunk
// regression amplifies quadratically.
const TRICKLE_FRAME = frame(tilePayload(MEDIUM_PAYLOAD, 64 * 1024));
const TRICKLE_FRAME_64B_CHUNKS = chunkBytes(TRICKLE_FRAME, 64);

// Realistic socket-read chunk shapes for large messages: app-level reads
// are typically 8–64 KB on Node TCP sockets. 1-byte workloads are skipped
// at this scale (they would take minutes per iteration).
const XL_FRAME_8K_CHUNKS = chunkBytes(XL_FRAME, 8 * 1024);
const XL_FRAME_1K_CHUNKS = chunkBytes(XL_FRAME, 1024);
const XXL_FRAME_64K_CHUNKS = chunkBytes(XXL_FRAME, 64 * 1024);
const XXL_FRAME_8K_CHUNKS = chunkBytes(XXL_FRAME, 8 * 1024);

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
// frame() — one-shot encoder
// ---------------------------------------------------------------------------

describe("frame() — encode by payload size", () => {
  bench("small payload (~300 B)", () => {
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
// unframe() — streaming workloads (~2 KB frame)
// ---------------------------------------------------------------------------

describe("unframe() — streaming workloads (~2 KB frame)", () => {
  bench("1 frame, 1 chunk (best case)", async () => {
    await drain([MEDIUM_FRAME]);
  });

  bench("1 frame, 64-byte chunks (~32 reads, MTU-like)", async () => {
    await drain(MEDIUM_FRAME_64B_CHUNKS);
  });

  bench("1 frame, 1-byte chunks (worst case, catches O(N²) regressions)", async () => {
    await drain(MEDIUM_FRAME_1B_CHUNKS);
  });

  bench("10 frames, 1 coalesced chunk (pipelined ~20 KB)", async () => {
    await drain(TEN_MEDIUM_FRAMES_COALESCED);
  });

  bench("1000 small frames, one chunk each (steady state)", async () => {
    await drain(THOUSAND_SMALL_FRAMES);
  });
});

// ---------------------------------------------------------------------------
// unframe() — the trickle / watermark guard
// ---------------------------------------------------------------------------

describe("unframe() — trickled frame (watermark guard)", () => {
  bench("64 KiB frame, 64 B chunks (~1024 reads)", async () => {
    await drain(TRICKLE_FRAME_64B_CHUNKS);
  });
});

// ---------------------------------------------------------------------------
// unframe() — large-message workloads (200 KB / 2 MB)
// ---------------------------------------------------------------------------

describe("unframe() — large messages (200 KB)", () => {
  bench("1 frame, 1 chunk", async () => {
    await drain([XL_FRAME]);
  });

  bench("1 frame, 8 KB chunks (~25 reads, typical socket recv)", async () => {
    await drain(XL_FRAME_8K_CHUNKS);
  });

  bench("1 frame, 1 KB chunks (~200 reads)", async () => {
    await drain(XL_FRAME_1K_CHUNKS);
  });
});

describe("unframe() — large messages (2 MB)", () => {
  bench("1 frame, 1 chunk", async () => {
    await drain([XXL_FRAME]);
  });

  bench("1 frame, 64 KB chunks (~32 reads, large-payload socket recv)", async () => {
    await drain(XXL_FRAME_64K_CHUNKS);
  });

  bench("1 frame, 8 KB chunks (~256 reads)", async () => {
    await drain(XXL_FRAME_8K_CHUNKS);
  });
});

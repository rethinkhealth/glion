/**
 * Byte and stream helpers shared by the MLLP byte-layer suites
 * (codec, transport) and the lab sweeps.
 */

const TEXT = new TextEncoder();

/** Real-shaped HL7v2 bytes: MSH + PID + N OBX segments. */
export function buildPayload(obxCount: number): Uint8Array {
  const segments = [
    "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ORU^R01|MSG001|P|2.5",
    "PID|1||12345||Doe^John^Q||19800101|M",
  ];
  for (let i = 1; i <= obxCount; i++) {
    segments.push(`OBX|${i}|NM|8302-2^Height^LN||${170 + i}|cm|150-200||||F`);
  }
  return TEXT.encode(segments.join("\r"));
}

/**
 * Repeat `base` to exactly `targetSize` bytes. The codecs inspect only
 * VT/FS bytes, so tiled bytes exercise the same memcpy / indexOf paths as
 * freshly-built ones at a fraction of the build cost.
 */
export function tilePayload(base: Uint8Array, targetSize: number): Uint8Array {
  const out = new Uint8Array(targetSize);
  for (let off = 0; off < targetSize; off += base.length) {
    out.set(base.subarray(0, Math.min(base.length, targetSize - off)), off);
  }
  return out;
}

/** Split bytes into consecutive chunks of `chunkSize` (last may be short). */
export function chunkBytes(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out.push(bytes.slice(i, Math.min(i + chunkSize, bytes.length)));
  }
  return out;
}

/** Concatenate `count` copies of one frame into a single buffer. */
export function concatFrames(frame: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(frame.length * count);
  for (let i = 0; i < count; i++) {
    out.set(frame, frame.length * i);
  }
  return out;
}

/** A ReadableStream that enqueues the given chunks and closes. */
export function source(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

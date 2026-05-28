import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createEmitter } from "../../src/child/emitter.js";

/**
 * A Writable subclass that captures chunks and lets tests toggle
 * backpressure. Call `drain()` to simulate the stream catching up.
 */
class FakeStdout extends Writable {
  chunks: string[] = [];
  backpressure = false;

  // oxlint-disable-next-line prefer-await-to-callbacks
  override _write(
    chunk: Buffer,
    _encoding: string,
    // oxlint-disable-next-line prefer-await-to-callbacks
    done: (error?: Error | null) => void
  ): void {
    this.chunks.push(chunk.toString());
    if (!this.backpressure) {
      done();
    }
    // When backpressured, don't call done — the stream buffers internally.
    // Call drain() to resume.
  }

  drain(): void {
    this.backpressure = false;
    this.emit("drain");
  }
}

describe("createEmitter", () => {
  it("writes encoded JSON lines to the stream", () => {
    const stream = new FakeStdout();
    const emit = createEmitter(stream, {
      nowIso: () => "2026-04-04T12:00:00.000Z",
    });
    emit({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
    });
    expect(stream.chunks).toHaveLength(1);
    expect(JSON.parse(stream.chunks[0]?.trim() ?? "")).toEqual({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "2026-04-04T12:00:00.000Z",
    });
  });

  it("preserves a caller-supplied ts", () => {
    const stream = new FakeStdout();
    const emit = createEmitter(stream, { nowIso: () => "now" });
    emit({
      id: 1,
      remote: "1.1.1.1:100",
      t: "conn.open",
      ts: "caller-ts",
    });
    expect(JSON.parse(stream.chunks[0]?.trim() ?? "").ts).toBe("caller-ts");
  });

  it("keeps memory bounded under sustained backpressure", () => {
    const stream = new FakeStdout();
    stream.backpressure = true;
    const emit = createEmitter(stream, { maxBuffered: 100, nowIso: () => "t" });

    for (let i = 0; i < 10_000; i += 1) {
      emit({ id: i, remote: `1:${i}`, t: "conn.open" });
    }
    expect(stream.chunks).toHaveLength(1);

    stream.drain();
    expect(stream.chunks.length).toBeLessThanOrEqual(101);
  });
});

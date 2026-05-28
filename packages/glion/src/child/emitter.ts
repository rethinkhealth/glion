import type { Writable } from "node:stream";

import { encode } from "../events.js";
import type { Event, PartialEvent } from "../events.js";

// ─── Public interface ──────────────────────────────────────────────

export interface EmitterOptions {
  /**
   * Maximum events buffered during backpressure before drop-oldest
   * kicks in. Default 1000.
   *
   * The tradeoff: higher = more memory but fewer dropped events
   * during transient pipe stalls. Lower = tighter memory bound but
   * events may be lost if the parent can't keep up. 1000 lines at
   * ~200 bytes each ≈ 200KB — negligible for any system running an
   * MLLP server.
   */
  maxBuffered?: number;
  /** Injectable clock for deterministic tests. */
  nowIso?: () => string;
}

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Creates the child's event emission function.
 *
 * ## Why this exists
 *
 * The child process communicates with the parent exclusively through
 * structured JSON events on stdout — one event per line. This is the
 * only IPC channel; there is no reverse path from parent to child.
 *
 * The emitter wraps `stream.write()` with two guarantees:
 *
 * 1. **Non-blocking** — MLLP message handlers must never stall waiting for the
 *    parent to read stdout. If `stream.write()` returns false (kernel pipe
 *    buffer full), events queue in memory and flush when the stream drains.
 * 2. **Bounded memory** — the queue is capped at `maxBuffered`. When full, the
 *    oldest pending event is silently dropped. A `dropped` summary event is
 *    injected before the next successful write so the parent can observe the
 *    loss. This prevents an unresponsive parent from causing the child to OOM.
 *
 * ## Backpressure flow
 *
 *     emit(event)
 *         │
 *         ▼
 *     stamp with ts → encode as JSON line
 *         │
 *         ├─ queue empty & not flushing?
 *         │    └─ flush() → write directly to stream
 *         │         ├─ write returns true  → continue draining queue
 *         │         └─ write returns false → stop, wait for "drain"
 *         │
 *         └─ queue non-empty or flushing?
 *              └─ enqueue(line) → append to FIFO
 *                   └─ queue > maxBuffered? → shift oldest, increment dropped
 *
 * ## Drop recovery
 *
 * When drops have occurred and the queue finally empties (backpressure
 * lifts), the next emit injects a `{ t: "dropped", count: N }` event
 * BEFORE the new event. This tells the parent "you missed N events
 * since the last successful write." The parent's TUI or log aggregator
 * can surface this as a warning.
 *
 * ## Timestamp stamping
 *
 * Each event receives a `ts` field (ISO 8601) at emit time. The
 * caller passes a `PartialEvent` (no `ts` required); the emitter
 * stamps it. If the caller already set `ts` (rare — only in tests),
 * the spread `{ ts: now(), ...partial }` lets the caller's value
 * win because it comes after the default.
 *
 * @param stream - The writable stdout pipe to the parent process.
 * @param options - Buffer size and clock injection for tests.
 * @returns An `emit(event)` function the runner calls for every event.
 */
export function createEmitter(
  stream: Writable,
  options: EmitterOptions = {}
): (event: PartialEvent) => void {
  const maxBuffered = options.maxBuffered ?? 1000;
  const now = options.nowIso ?? (() => new Date().toISOString());

  /** Bounded FIFO of JSON-encoded lines waiting to be written. */
  const queue: string[] = [];

  /** True while flush() is draining the queue. Prevents re-entrant flushes. */
  let flushing = false;

  /** Number of events dropped since the last successful drain. */
  let dropped = 0;

  /**
   * Drains the queue into the stream, one line at a time.
   *
   * When `stream.write()` returns false, the kernel pipe buffer is
   * full — the parent hasn't read yet. We stop and register a one-
   * shot `drain` listener so flush resumes when space opens up.
   * This is Node's standard backpressure protocol.
   */
  const flush = (): void => {
    flushing = true;
    while (queue.length > 0) {
      const line = queue.shift() as string;
      if (!stream.write(line)) {
        // Pipe full — pause and resume when the parent catches up.
        stream.once("drain", flush);
        return;
      }
    }
    // Queue drained completely.
    flushing = false;
  };

  /**
   * Adds a line to the queue. If the queue exceeds maxBuffered,
   * drop the oldest line (FIFO eviction) and count the loss. The
   * dropped count is reported to the parent on the next clean flush.
   */
  const enqueue = (line: string): void => {
    queue.push(line);
    if (queue.length > maxBuffered) {
      queue.shift();
      dropped += 1;
    }
  };

  // ── The emit function ──────────────────────────────────────────
  //
  // This is the function every part of the child runner calls:
  //   emit({ t: "ready", port: 2575, ... })
  //   emit({ t: "msg", conn: 1, trigger: "ADT^A01", ... })
  //   emit({ t: "fatal", kind: "child-crashed", ... })
  //
  // It's synchronous from the caller's perspective — MLLP message
  // handlers never await I/O for telemetry.
  return function emit(partial) {
    // Stamp `ts` only. Severity is a property of the event TYPE
    // (see `eventLevel()` in events.ts), except for `log` where the
    // caller supplies it as part of the partial — so nothing to
    // translate here either way.
    const event = { ts: now(), ...partial } as Event;

    // If drops occurred and we're in a clean state (queue drained,
    // not mid-flush), inject a summary event so the parent knows
    // how many events were lost.
    if (dropped > 0 && queue.length === 0 && !flushing) {
      enqueue(encode({ count: dropped, t: "dropped", ts: now() }));
      dropped = 0;
    }

    enqueue(encode(event));

    // If we're not already draining, start now.
    if (!flushing) {
      flush();
    }
  };
}

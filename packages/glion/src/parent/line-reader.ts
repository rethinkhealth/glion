/**
 * Bounded NDJSON line reader for IPC between the parent and the child.
 *
 * ## Why this module exists
 *
 * The parent process reads the child's stdout as a stream of JSON
 * events, one per line. The obvious implementation is
 * `readline.createInterface` — and that is what the code used until
 * this module replaced it. Readline has no line-length cap: if the
 * child writes gigabytes without a newline (a buggy middleware calling
 * `process.stdout.write(JSON.stringify(huge))` without `\n`, a native
 * addon that bypasses `installConsoleCapture`, or a compromised child
 * trying to DoS the parent), the parent buffers the entire blob until
 * either a newline eventually arrives or V8 OOMs.
 *
 * ## Why popular line splitters don't cap either
 *
 * `split2`, `byline`, `ndjson`, and friends don't cap their internal
 * buffer. That is the right default for their typical use case:
 * producer and consumer are in the same trust domain (your app
 * parsing its own logs, or an API route parsing a request body
 * that's already been size-limited by a reverse proxy). A
 * gigabyte-long line there means an application bug, not a hostile
 * producer.
 *
 * Boundary parsers that face untrusted producers DO cap — Node's
 * `http` parser caps headers via `maxHeaderSize` (16 KB default),
 * Docker's json-log driver caps per-chunk size, Kubernetes' kubelet
 * caps container log line length, Postgres' wire protocol enforces
 * per-message length limits. glion sits closer to that category:
 * the parent reads stdout from a child running code it didn't write.
 * In a local dev session that's a soft trust boundary; in a hosted
 * or multi-tenant deployment (shared CI runners, cloud IDEs, dev
 * containers) it's a real one.
 *
 * ## Why roll our own rather than wrap `split2`
 *
 * `split2` doesn't cap, so a wrapper would have to reimplement the
 * cap logic anyway — and the cap logic is most of this file. Writing
 * it directly keeps the module dependency-free and puts the
 * overflow-signaling behavior (fire `onOverflow` exactly once per
 * dropped line, deferred until the terminator so callers get the
 * true byte count in a single callback) in one obvious place.
 *
 * ## Guarantees this module provides
 *
 * 1. The internal buffer never exceeds `maxLineLength`. A producer cannot grow
 *    parent memory by withholding newlines.
 * 2. Lines longer than the cap are dropped, never delivered. `onOverflow` fires
 *    exactly once per dropped line with the full dropped byte count.
 * 3. Partial content buffered when the stream ends (no terminating `\n`) is
 *    delivered on a best-effort basis. Readline silently discarded this case —
 *    we don't, so a child SIGKILLed mid-write of its final `fatal` event still
 *    has that partial line seen by the parent.
 * 4. The delimiter is `\n`. A trailing `\r` stays attached to the line — the
 *    child's emitter writes `\n` only, so `\r\n` should never occur on this
 *    channel, and a caller who sees one probably wants to notice rather than
 *    have it silently stripped.
 */

import type { Readable } from "node:stream";

/**
 * 1 MiB default cap. Real child events are well under 1 KB (a typical
 * `msg` event is ~200 bytes of JSON); a megabyte is orders of
 * magnitude larger than any legitimate line and still small enough
 * that buffering one never puts meaningful memory pressure on the
 * parent. Callers can override for tests or for a stricter policy.
 */
const DEFAULT_MAX_LINE_LENGTH = 1_048_576;

export interface ReadLinesOptions {
  /**
   * Maximum bytes for a single line. A line longer than this is
   * dropped entirely and `onOverflow` is called with the dropped
   * byte count. Default: 1 MiB.
   *
   * @default 1MB
   */
  maxLineLength?: number;
  /**
   * Called when a line is dropped due to overflow, with an estimate of
   * the bytes discarded. Fires at most once per dropped line.
   */
  onOverflow?: (droppedBytes: number) => void;
}

/**
 * Attaches `data` and `end` handlers to `input` that feed `onLine`
 * per complete `\n`-terminated line. See the file header for the full
 * rationale (why this module exists, why we cap, why we don't take a
 * dep on `split2`).
 */
export function readLines(
  input: Readable,
  onLine: (line: string) => void,
  opts: ReadLinesOptions = {}
): void {
  const maxLineLength = opts.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const onOverflow = opts.onOverflow;

  // Decode bytes → UTF-8 strings. Node's StringDecoder (triggered by
  // setEncoding) buffers partial multi-byte sequences across chunks,
  // so a character split across a chunk boundary still arrives intact
  // — tested in line-reader.test.ts:"handles multi-byte UTF-8".
  input.setEncoding("utf8");

  // State machine. Two states:
  //   normal   — buffer accumulates a line in progress, capped at
  //              maxLineLength.
  //   skipping — we already saw a line exceed the cap and are
  //              scanning forward for the next `\n` to resync. The
  //              buffer is empty in this state; skippedBytes counts
  //              what we've discarded so onOverflow fires exactly
  //              once, with the correct total, when the terminator
  //              arrives.
  let buffer = "";
  let skipping = false;
  let skippedBytes = 0;

  input.on("data", (chunk: string) => {
    let cursor = 0;

    while (cursor < chunk.length) {
      if (skipping) {
        const newlineAt = chunk.indexOf("\n", cursor);
        if (newlineAt === -1) {
          // Whole chunk is still part of the oversized line we're
          // dropping. Keep counting; stay in `skipping`.
          skippedBytes += chunk.length - cursor;
          return;
        }
        // Terminator found → report the full discard, exit `skipping`,
        // and resume normal parsing on whatever follows the newline.
        skippedBytes += newlineAt - cursor;
        onOverflow?.(skippedBytes);
        skippedBytes = 0;
        skipping = false;
        cursor = newlineAt + 1;
        continue;
      }

      const newlineAt = chunk.indexOf("\n", cursor);
      if (newlineAt === -1) {
        // No more newlines in this chunk. Either append to the line
        // buffer, or — if doing so would push it past the cap —
        // enter `skipping` mode and drop the whole line-in-progress.
        //
        // Crucially we check BEFORE concatenating: if `chunk.slice`
        // alone is 10 MiB, we must not materialize it on the buffer
        // or we've defeated the cap. `remainingLength` is O(1)
        // because `chunk` is already a string in memory — no new
        // allocation until we actually slice.
        //
        // We defer onOverflow until the terminator (or stream end)
        // arrives, so callers see one callback per dropped line with
        // the true total — never a partial mid-line number.
        const remainingLength = chunk.length - cursor;
        if (buffer.length + remainingLength > maxLineLength) {
          skippedBytes = buffer.length + remainingLength;
          buffer = "";
          skipping = true;
        } else {
          buffer += chunk.slice(cursor);
        }
        return;
      }

      // Newline found within this chunk. Assemble the full line from
      // (buffer so far) + (chunk slice up to the newline).
      const lineLength = buffer.length + (newlineAt - cursor);
      if (lineLength > maxLineLength) {
        // Exact-boundary case: the newline arrived within one chunk
        // but the line crosses the cap. Drop it; we never appended
        // to `buffer` past the cap, so no memory leaked — we just
        // measured and discarded.
        onOverflow?.(lineLength);
      } else {
        onLine(buffer + chunk.slice(cursor, newlineAt));
      }
      buffer = "";
      cursor = newlineAt + 1;
    }
  });

  input.on("end", () => {
    if (skipping) {
      // We were mid-drop when the stream closed. Report any bytes
      // counted since the last `onOverflow` so the caller's total
      // matches reality even without a final terminator.
      if (skippedBytes > 0) {
        onOverflow?.(skippedBytes);
      }
      skippedBytes = 0;
      skipping = false;
      return;
    }
    if (buffer.length === 0) {
      return;
    }
    // Partial trailing line, no terminating `\n`. Canonical case: a
    // child SIGKILLed mid-write of its final `fatal` event.
    // Readline silently discarded this content; we deliver it
    // best-effort so the parent can still observe whatever partial
    // payload made it through before the kill.
    if (buffer.length > maxLineLength) {
      onOverflow?.(buffer.length);
    } else {
      onLine(buffer);
    }
    buffer = "";
  });
}

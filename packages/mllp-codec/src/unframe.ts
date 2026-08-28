/**
 * The inbound half of the frame/unframe pair: a stream transform that turns
 * wire bytes into complete MLLP payloads, plus the internal push-based engine
 * that powers it.
 *
 * @module
 */

import { CR, FS, VT } from "./constants";
import { MllpCodecError, MllpCodecErrorCode } from "./errors";

/** Options for {@link unframe}. */
export interface UnframeOptions {
  /**
   * Maximum bytes buffered for an in-progress frame before the stream
   * errors with `MESSAGE_TOO_LARGE`. Defence against a sender that opens
   * a frame and never terminates it.
   *
   * The bound is enforced as bytes arrive, before frames are extracted —
   * so it also caps `carried-over bytes + one inbound chunk`, even when
   * that chunk is composed entirely of small complete frames. The default
   * sits far above any realistic socket read; a custom cap must leave room
   * for the largest single chunk the transport can deliver, not just the
   * largest frame.
   *
   * @default 16777216 (16 MiB)
   */
  readonly maxBufferedBytes?: number;
}

/**
 * The inbound counterpart to `frame()`: a transform that turns the wire's
 * byte stream into a stream of complete MLLP payloads — one HL7v2 message per
 * chunk out, with partial and coalesced frames reassembled across reads.
 *
 * ```ts
 * for await (const message of socket.readable.pipeThrough(unframe())) {
 *   handle(message);
 * }
 * ```
 *
 * Protocol violations error the stream with a {@link MllpCodecError}:
 * bytes outside any message (`UNEXPECTED_DATA`), a reserved character inside
 * an unterminated message (`RESERVED_CHARACTER` — messages can never glue),
 * end-of-stream in the middle of a message (`INCOMPLETE_MESSAGE`), and the
 * {@link UnframeOptions.maxBufferedBytes} cap (`MESSAGE_TOO_LARGE`).
 */
export function unframe(
  options: UnframeOptions = {}
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = createFrameDecoder(options);
  return new TransformStream<Uint8Array, Uint8Array>({
    flush(controller) {
      if (decoder.buffered > 0) {
        controller.error(
          new MllpCodecError(
            MllpCodecErrorCode.INCOMPLETE_MESSAGE,
            `Byte stream ended in the middle of an MLLP message; ${decoder.buffered} byte(s) arrived without the FS+CR terminator`
          )
        );
      }
    },
    transform(chunk, controller) {
      const err = decoder.push(chunk, (message) => controller.enqueue(message));
      if (err) {
        controller.error(err);
      }
    },
  });
}

// ===========================================================================
// Internal: the push-based engine behind unframe
// ===========================================================================

interface FrameDecoder {
  /**
   * Push a chunk of bytes from the wire. Emits each complete frame's
   * PAYLOAD — the envelope (VT, FS, CR) never leaves the decoder — via
   * `onPayload` as it's extracted. Returns `null` on success or a
   * {@link MllpCodecError} on structural violation. Payloads extracted
   * before the violation have already reached `onPayload` — but note that
   * the TransformStream wrapper enqueues them, and Web Streams discard an
   * erroring stream's queue: consumers that have not yet read them will
   * never see them (documented in the README).
   *
   * After an error the decoder's buffer state is undefined — discard
   * the decoder.
   *
   * `onPayload` MUST NOT throw; if it does, the exception propagates
   * out of `push` and leaves the decoder in an inconsistent state.
   */
  push(
    chunk: Uint8Array,
    onPayload: (payload: Uint8Array) => void
  ): MllpCodecError | null;

  /** Bytes currently held for an in-progress frame. */
  readonly buffered: number;
}

const DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
const INITIAL_CAPACITY = 64;

/**
 * Create a stateful, push-based decoder for socket reads.
 *
 * ## How it works
 *
 * The decoder owns two fields captured in the closure:
 *
 * - `buffer` — a `Uint8Array` holding bytes received but not yet emitted as a
 *   complete frame. Grows by doubling, never shrinks.
 * - `length` — the logical byte count in `buffer[0..length)`. Always ≤
 *   `buffer.length`; bytes at `buffer[length..]` are unused capacity, not data.
 *   We track this separately because typed arrays have fixed capacity, so we
 *   can't use `.length` to mean "current size" the way you would with `Array`.
 *
 * ## How the scan works
 *
 * One pass, one rule. `scanned` marks the first byte the scan has not yet
 * classified; everything before it is settled payload. From there, the next
 * FS decides what happens: a VT seen before it is a framing violation (a new
 * frame began inside this one), an FS followed by CR ends the frame, an FS
 * followed by anything else is payload (Mirth / HAPI leniency) — and an FS
 * sitting at the very end of the buffer is simply left unclassified until
 * its successor arrives on the next push. That one "wait for the successor"
 * rule is the whole split-terminator story; nothing is ever re-derived.
 *
 * ## Invariant
 *
 * After every successful `push()`, `buffer[0..length)` either is
 * empty OR holds the single in-progress frame, starting at offset 0
 * with its VT. The decoder never holds "garbage between frames": if
 * the byte following an emitted frame isn't VT, `push` returns
 * `UNEXPECTED_DATA` immediately rather than waiting to see what
 * comes next. This keeps failure detection eager.
 *
 * ## Complexity
 *
 * Every byte is classified once: the scan resumes at `scanned`, and the
 * FS/VT searches are vectorised `indexOf` jumps over the unclassified
 * span only. The `subarray` calls those searches go through are zero-copy
 * views (a tiny ephemeral header over the same bytes) — and the view's end
 * bound is load-bearing: an unbounded `indexOf(byte, from)` would walk the
 * stale capacity past `length`. N pushes that buffer K bytes total
 * amortise to O(N + K) — the trickle benchmarks in ../bench pin this. The
 * only data copy in the engine is the deliberate `slice` on emit (below).
 * Memory is bounded by `maxBufferedBytes` (or the largest single frame
 * ever buffered, rounded up to the next power of two).
 *
 * ## Frames are copied on emit
 *
 * `onPayload(payload)` receives a fresh `Uint8Array` via
 * `Uint8Array#slice`, not a `subarray` view. The buffer's underlying
 * `ArrayBuffer` is reused — a later `push` may overwrite those
 * bytes during compaction or replace the buffer entirely during
 * growth. A view would silently alias data we're about to clobber.
 * Copying makes the emitted frame independent and safe for the
 * consumer to retain across pushes.
 */
function createFrameDecoder(opts: UnframeOptions = {}): FrameDecoder {
  const max = opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  let buffer = new Uint8Array(0);
  let length = 0;
  // Where the current in-progress frame begins (its VT)...
  let start = 0;
  // ...and the first byte the scan has not classified yet. Both survive
  // across pushes; the compaction at the end of each push shifts them.
  let scanned = 0;
  // Bytes already emitted or discarded ahead of buffer[0] — purely for
  // diagnostics, so error offsets are positions in the connection's byte
  // stream (what an operator sees in a capture), not in a compacted buffer.
  let consumed = 0;

  return {
    get buffered() {
      return length;
    },

    push(chunk, onPayload) {
      // Empty chunks: some adapters yield a zero-byte read before
      // EOF (e.g. Node's `'data'` after `socket.end()` in some
      // edge cases). Treat as no-op so correct callers aren't
      // punished for a transport quirk.
      if (chunk.length === 0) {
        return null;
      }

      // Reject before allocating. A sender that opens a frame and
      // never terminates it must not force a max-sized allocation
      // just to be told we'd reject.
      const needed = length + chunk.length;
      if (needed > max) {
        return new MllpCodecError(
          MllpCodecErrorCode.MESSAGE_TOO_LARGE,
          `Inbound MLLP message exceeds the maxBufferedBytes limit (${max} bytes)`
        );
      }

      // Doubling growth gives O(N) amortised total cost across N
      // appends (each byte is copied at most O(log N) times, and
      // the geometric series collapses to a constant factor).
      // Cap the capacity at `max`: with a small budget there's no
      // reason to over-allocate above the rejection threshold.
      if (needed > buffer.length) {
        let cap = buffer.length || INITIAL_CAPACITY;
        while (cap < needed) {
          cap *= 2;
        }
        const grown = new Uint8Array(Math.min(cap, max));
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(chunk, length);
      length += chunk.length;

      while (scanned < length) {
        // The cursor is sitting on a candidate frame's first, not-yet-
        // validated byte — true exactly once per frame, via three routes:
        // the stream's first bytes, the byte right after a frame emitted
        // earlier in this same pass (how garbage between frames is caught),
        // or a fresh push after a full drain. A mid-frame resumption never
        // lands here: the VT check below already advanced `scanned` past
        // `start`. A frame opens with VT; anything else is garbage.
        if (scanned === start) {
          const got = buffer[start] as number;
          if (got !== VT) {
            return new MllpCodecError(
              MllpCodecErrorCode.UNEXPECTED_DATA,
              `Received data outside of an MLLP message at stream offset ${consumed + start}: expected a message to begin with VT (0x0B), got 0x${got.toString(16).padStart(2, "0")}`
            );
          }
          scanned = start + 1;
          continue;
        }

        // The next FS decides everything that follows. Offsets returned by
        // these subarray searches are relative to `scanned`; -1 = not found.
        const fsOffset = buffer.subarray(scanned, length).indexOf(FS);

        // Inbound bytes are untrusted input from a remote system, and this is
        // the boundary where the one corruption framing CAN see gets caught:
        // this frame opened with its own VT, so another VT before the
        // terminator means the sender started its next message without
        // finishing this one. Failing here — the moment that VT arrives —
        // keeps two messages from gluing into one payload and stops us
        // buffering garbage while waiting for a terminator that may never
        // come. The span to check runs up to that FS — or, while no FS has
        // arrived, to the end of what's buffered. Each byte is VT-scanned
        // once, ever, vectorised like the FS scan. (Lone FS stays lenient
        // below — Mirth / HAPI compat — and outbound `frame()` enforces
        // the mirror rule on what we send.)
        const embeddedVtOffset = buffer
          .subarray(scanned, fsOffset === -1 ? length : scanned + fsOffset)
          .indexOf(VT);
        if (embeddedVtOffset !== -1) {
          return new MllpCodecError(
            MllpCodecErrorCode.RESERVED_CHARACTER,
            `MLLP reserved character VT (0x0B) inside an unterminated message at stream offset ${consumed + scanned + embeddedVtOffset}; a message must not contain VT`
          );
        }

        if (fsOffset === -1) {
          // All payload so far; the terminator hasn't arrived.
          scanned = length;
          break;
        }

        // From here on an FS really exists, at this absolute position.
        const fsAt = scanned + fsOffset;
        if (fsAt === length - 1) {
          // Terminator or payload? Undecidable until the FS's successor
          // arrives — leave it unclassified and resume here next push.
          scanned = fsAt;
          break;
        }
        if (buffer[fsAt + 1] === CR) {
          // Frame complete: emit the de-enveloped payload — the VT at
          // `start` and this FS+CR never leave the decoder. `slice` copies
          // into a fresh ArrayBuffer; `subarray` would alias bytes the
          // compaction below (or a future growth) will clobber.
          onPayload(buffer.slice(start + 1, fsAt));
          start = fsAt + 2;
          scanned = start;
        } else {
          // Lone FS: payload content (Mirth / HAPI leniency).
          scanned = fsAt + 1;
        }
      }

      // Restore the between-pushes invariant the append above relies on: the
      // in-progress frame (if any) lives at offset 0. Reached at the end of
      // EVERY successful push (error returns skip it — an errored decoder is
      // discarded anyway); it only has work to do when frames were emitted
      // this pass, because only an emit moves `start`. The bytes before
      // `start` are dead — payloads already sliced out, envelopes consumed —
      // and the live tail slides down over them:
      //
      //   before:   0         start        scanned     length
      //             ▼         ▼            ▼           ▼
      //   buffer  [ ··dead··· ][V ··in-progress·· ·····]
      //
      //   slide everything left by `start` (copyWithin), then:
      //
      //   after:    0          scanned−start  length−start
      //             ▼          ▼              ▼
      //   buffer  [ [V ··in-progress·· ·····]            (stale capacity)
      //
      //   length  -= start    live byte count drops by the dead prefix
      //   scanned -= start    the cursor rides with the byte it points at
      //   consumed += start   buffer[0]'s stream offset (diagnostics only)
      //   start    = 0        the invariant itself, restored
      //
      // Fully drained (start === length) is the same arithmetic, not a
      // special case: the copy moves zero bytes and every cursor lands on 0.
      if (start > 0) {
        buffer.copyWithin(0, start, length);
        length -= start;
        scanned -= start;
        consumed += start;
        start = 0;
      }

      assertInvariant();
      return null;
    },
  };

  // Engine self-check, run once at the end of every successful push. This is
  // NOT input validation (inputs have real error paths in the scan) — it
  // makes OUR cursor arithmetic going wrong loud, instead of letting a
  // mis-shifted cursor silently corrupt the next frame. A handful of
  // comparisons per push; a plain Error (never a MllpCodecError) so an engine
  // bug can never masquerade as the sender's protocol violation.
  function assertInvariant(): void {
    const settled =
      scanned === length || (scanned === length - 1 && buffer[scanned] === FS);
    const anchored = length === 0 || (scanned >= 1 && buffer[0] === VT);
    if (start === 0 && settled && anchored) {
      return;
    }
    throw new Error(
      `@glion/mllp-codec internal invariant violated after push (start=${start}, scanned=${scanned}, length=${length}); this is a bug in the decoder — please report it`
    );
  }
}

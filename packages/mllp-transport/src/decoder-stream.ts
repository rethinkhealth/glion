import { MLLP_END_BYTE_1, MLLP_END_BYTE_2, MLLP_START_BYTE } from "./constants";
import { DynamicBuffer } from "./dynamic-buffer";
import { TransportError } from "./errors";
import type { DecodedMessage, DecoderOptions } from "./types";
import { TransportErrorCode } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Internal state of the two-state frame decoder.
 *
 * - `WAITING_START` — scanning for VT (0x0B) start byte; any non-start bytes are
 *   reported via `onError` and discarded.
 * - `IN_MESSAGE` — accumulating payload bytes until the FS CR (0x1C 0x0D) end
 *   sequence is found.
 */
type DecoderState = "WAITING_START" | "IN_MESSAGE";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultOnError(error: TransportError): void {
  console.warn(`MLLP decode error: [${error.code}] ${error.message}`);
}

/**
 * Default decoder options, merged with user-provided values via spread.
 *
 * - `encoding` — `"utf8"`, the standard encoding for HL7v2.
 * - `onError` — logs to `console.warn`; the stream continues processing.
 */
const defaultDecoderOptions: Required<
  Pick<DecoderOptions, "encoding" | "onError">
> = {
  encoding: "utf8",
  onError: defaultOnError,
};

// ---------------------------------------------------------------------------
// Transformer factory
// ---------------------------------------------------------------------------

/**
 * Build the {@link Transformer} that powers both {@link createDecoderStream}
 * and {@link MLLPDecoderStream}.
 *
 * ## How MLLP framing works
 *
 * Every HL7v2 message on the wire is wrapped in a minimal envelope:
 *
 *     <VT> message-payload <FS><CR>
 *     0x0B                 0x1C 0x0D
 *
 * Multiple frames can arrive back-to-back within the same TCP stream.
 * The decoder's job is to find each `<VT>…<FS><CR>` envelope, strip
 * the framing bytes, and emit the inner payload as a {@link DecodedMessage}.
 *
 * ## State machine
 *
 * The decoder alternates between two states:
 *
 *     ┌──────────────┐   VT found    ┌────────────┐
 *     │ WAITING_START │──────────────▶│ IN_MESSAGE │
 *     └──────┬───────┘               └─────┬──────┘
 *            ▲  garbage → onError          │
 *            │                             │ FS CR found → emit message
 *            └─────────────────────────────┘
 *
 * 1. **WAITING_START** — Scans byte-by-byte for a VT start byte. Any bytes
 *    encountered before the VT are garbage (e.g. noise on the line or a partial
 *    connection reset); they are reported via `onError` and discarded.
 * 2. **IN_MESSAGE** — Scans for the two-byte FS CR end sequence. Once found, the
 *    bytes between VT and FS CR are the message payload. The decoder emits the
 *    message and transitions back to WAITING_START.
 *
 * ## Chunk boundaries
 *
 * TCP delivers data in arbitrarily-sized chunks that rarely align with
 * MLLP frame boundaries. A single chunk may contain:
 *
 * - A fraction of one frame (the rest arrives in the next chunk)
 * - Exactly one frame
 * - Multiple complete frames
 * - A mix of complete frames and a trailing partial frame
 *
 * The transformer handles all of these by appending every incoming
 * chunk to an internal `buffer`, then running `processBuffer()` to
 * extract as many complete frames as possible. Any leftover bytes
 * (a partial frame) stay in the buffer until the next chunk arrives.
 *
 * ## Error recovery
 *
 * The decoder offers two error modes, selected by what the
 * caller-supplied `onError` callback does (see {@link DecoderOptions.onError}):
 *
 * - **Lenient (default)** — `onError` returns normally; the decoder logs the
 *   error and keeps scanning for the next valid frame. The stream stays open
 *   and continues processing subsequent frames.
 * - **Fatal** — `onError` throws; the throw propagates out of the underlying
 *   `transform()` call and errors the readable side of the `TransformStream`.
 *   Downstream `for await ... of` consumers reject with the thrown value.
 *
 * Error scenarios:
 *
 * - **Garbage before VT** — bytes are skipped, `INVALID_START_BYTE` reported.
 * - **Oversized message** — frame is abandoned, `MESSAGE_TOO_LARGE` reported.
 * - **Incomplete frame at stream end** — `INCOMPLETE_MESSAGE` reported during
 *   `flush()`. Recovery is impossible at this point because the stream has
 *   already ended; the consumer sees end-of-stream regardless of error mode.
 *
 * ## Size enforcement
 *
 * When `maxMessageSize` is set, the decoder checks the payload length
 * in two places to bound memory usage:
 *
 * 1. **Mid-accumulation** — while waiting for the end sequence, if the buffered
 *    payload already exceeds the limit, the frame is abandoned immediately.
 *    This prevents a missing end sequence from causing unbounded buffer
 *    growth.
 * 2. **On completion** — once the end sequence is found, the final payload length
 *    is checked before the message is enqueued.
 */
function createDecoderTransformer(options?: DecoderOptions) {
  const opts = { ...defaultDecoderOptions, ...options };
  const textDecoder = new TextDecoder(opts.encoding);

  // -------------------------------------------------------------------------
  // Mutable decoder state (scoped to this transformer instance)
  // -------------------------------------------------------------------------

  /**
   * Accumulation buffer — grows as chunks arrive, shrinks as frames are
   * consumed.
   */
  const dynBuffer = new DynamicBuffer();

  /** Current state machine position. */
  let state: DecoderState = "WAITING_START";

  /**
   * Byte offset within the buffer view where the current frame's VT start byte
   * lives. Only meaningful when `state === "IN_MESSAGE"`.
   */
  let messageStartPos = 0;

  // -------------------------------------------------------------------------
  // Buffer scanning helpers
  // -------------------------------------------------------------------------

  /**
   * Scan `view` for the next VT (0x0B) at or after `startPos`.
   *
   * @returns The index of the VT byte, or -1 if not found.
   */
  function findStartByte(view: Uint8Array, startPos: number): number {
    for (let i = startPos; i < view.length; i++) {
      if (view[i] === MLLP_START_BYTE) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Scan `view` for the two-byte FS CR (0x1C 0x0D) end sequence
   * at or after `startPos`.
   *
   * @returns The index of the FS byte (first byte of the pair), or -1 if not
   *   found.
   */
  function findEndSequence(view: Uint8Array, startPos: number): number {
    for (let i = startPos; i < view.length - 1; i++) {
      if (view[i] === MLLP_END_BYTE_1 && view[i + 1] === MLLP_END_BYTE_2) {
        return i;
      }
    }
    return -1;
  }

  // -------------------------------------------------------------------------
  // Core processing loop
  // -------------------------------------------------------------------------

  /**
   * Drain as many complete frames from the buffer as possible, enqueuing
   * each decoded message into `controller`.
   *
   * Returns when the buffer contains only an incomplete frame (or is
   * empty). The incomplete bytes are kept for the next `transform()` call.
   *
   * The loop uses a local `position` cursor that always resets to 0
   * after a `consume()` call, since consumption shifts the view.
   */
  function processBuffer(
    controller: TransformStreamDefaultController<DecodedMessage>
  ): void {
    let position = 0;

    while (true) {
      const view = dynBuffer.view();
      if (position >= view.length) {
        break;
      }

      // ── WAITING_START ──────────────────────────────────────────────
      // Look for a VT byte that begins a new MLLP frame.
      if (state === "WAITING_START") {
        const startPos = findStartByte(view, position);

        if (startPos === -1) {
          // No VT anywhere in the remaining buffer — all garbage.
          if (view.length > 0) {
            opts.onError(
              new TransportError(
                TransportErrorCode.INVALID_START_BYTE,
                `Skipped ${view.length - position} bytes before finding start byte`,
                position
              )
            );
          }
          dynBuffer.reset();
          return;
        }

        // Report any garbage bytes that appeared before the VT.
        if (startPos > position) {
          opts.onError(
            new TransportError(
              TransportErrorCode.INVALID_START_BYTE,
              `Skipped ${startPos - position} bytes before start byte`,
              position
            )
          );
        }

        // Transition: we found VT, now accumulate the payload.
        state = "IN_MESSAGE";
        messageStartPos = startPos;
        position = startPos + 1; // advance past VT
      }

      // ── IN_MESSAGE ─────────────────────────────────────────────────
      // We have a VT; now look for the FS CR end sequence.
      if (state === "IN_MESSAGE") {
        const endPos = findEndSequence(view, position);

        if (endPos === -1) {
          // End sequence not yet in buffer — need more data from the wire.
          //
          // Before returning, check if the partial payload already exceeds
          // maxMessageSize. If so, abandon this frame early to avoid
          // unbounded buffer growth (e.g. a missing end sequence on a
          // very large or malicious stream).
          const currentSize = view.length - messageStartPos - 1;
          if (
            opts.maxMessageSize !== undefined &&
            currentSize > opts.maxMessageSize
          ) {
            opts.onError(
              new TransportError(
                TransportErrorCode.MESSAGE_TOO_LARGE,
                `Message size ${currentSize} exceeds maximum ${opts.maxMessageSize}`,
                messageStartPos
              )
            );

            // Abandon this frame. Resume scanning for a new VT starting
            // one byte after the current frame's VT (it might have been
            // a false start).
            state = "WAITING_START";
            position = messageStartPos + 1;
            dynBuffer.consume(position);
            position = 0;
            continue;
          }

          // Compact: shift the partial frame to the start of the buffer
          // so we don't re-scan already-consumed bytes on the next chunk.
          if (messageStartPos > 0) {
            dynBuffer.consume(messageStartPos);
            messageStartPos = 0;
          }
          return; // wait for more data
        }

        // ── Complete frame found ───────────────────────────────────
        // Extract the payload: everything between VT and FS CR.
        //
        //   view: ... [VT] [payload bytes...] [FS] [CR] ...
        //              ^                       ^
        //        messageStartPos              endPos
        //
        //   payload = view[messageStartPos+1 .. endPos)
        //
        const messageData = view.slice(messageStartPos + 1, endPos);
        const messageLength = messageData.length;

        // Final size check on the complete payload.
        if (
          opts.maxMessageSize !== undefined &&
          messageLength > opts.maxMessageSize
        ) {
          opts.onError(
            new TransportError(
              TransportErrorCode.MESSAGE_TOO_LARGE,
              `Message size ${messageLength} exceeds maximum ${opts.maxMessageSize}`,
              messageStartPos
            )
          );
        } else {
          // Emit the decoded message downstream.
          controller.enqueue({
            byteLength: messageLength,
            data: messageData,
            text: textDecoder.decode(messageData),
          });
        }

        // Advance past the FS CR end sequence (2 bytes) and compact
        // the buffer so the next iteration starts fresh.
        position = endPos + 2;
        state = "WAITING_START";
        dynBuffer.consume(position);
        position = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Transformer interface returned to TransformStream
  // -------------------------------------------------------------------------

  return {
    /**
     * Called when the writable side of the stream closes (TCP connection
     * ended). If we're mid-frame, it means the connection dropped before
     * a complete MLLP envelope was received — report it via `onError`.
     */
    flush(_controller: TransformStreamDefaultController<DecodedMessage>): void {
      if (state === "IN_MESSAGE" && dynBuffer.available > 0) {
        opts.onError(
          new TransportError(
            TransportErrorCode.INCOMPLETE_MESSAGE,
            "Stream ended with incomplete MLLP message",
            messageStartPos
          )
        );
      }
    },

    /**
     * Called for each chunk of bytes received from the TCP socket.
     * Appends the chunk to the internal buffer and extracts any
     * complete MLLP frames that are now available.
     */
    transform(
      chunk: Uint8Array,
      controller: TransformStreamDefaultController<DecodedMessage>
    ): void {
      dynBuffer.append(chunk);
      processBuffer(controller);
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a `TransformStream` that extracts MLLP messages from a raw
 * byte stream.
 *
 * Pipe a TCP socket's `ReadableStream<Uint8Array>` through this stream
 * to receive one {@link DecodedMessage} per MLLP frame, regardless of
 * how the bytes are chunked on the wire.
 *
 * @example
 *   Lenient (default) — log and keep scanning:
 *
 *   ```typescript
 *   import { createDecoderStream } from "@glion/mllp-transport";
 *
 *   const decoder = createDecoderStream({
 *   maxMessageSize: 1024 * 1024,
 *   onError: (err) => log.warn(err),
 *   });
 *
 *   for await (const frame of socket.readable.pipeThrough(decoder)) {
 *   console.log(frame.text);
 *   }
 *   ```;
 *
 * @example
 *   Fatal — throw to error the stream on any frame error:
 *
 *   ```typescript
 *   const decoder = createDecoderStream({
 *   maxMessageSize: 1024 * 1024,
 *   onError: (err) => {
 *   throw new Error(`framing failed: ${err.message}`, { cause: err });
 *   },
 *   });
 *
 *   try {
 *   for await (const frame of socket.readable.pipeThrough(decoder)) {
 *   handle(frame);
 *   }
 *   } catch (err) {
 *   // err is the value thrown from onError
 *   }
 *   ```;
 *
 * @param options - Optional decoder settings (max size, encoding, error
 *   handler). See {@link DecoderOptions.onError} for the lenient/fatal
 *   error-mode contract.
 * @returns A `TransformStream<Uint8Array, DecodedMessage>`.
 */
export function createDecoderStream(
  options?: DecoderOptions
): TransformStream<Uint8Array, DecodedMessage> {
  return new TransformStream(createDecoderTransformer(options));
}

/**
 * Class-based variant of {@link createDecoderStream} for cases where
 * a reusable instance is preferred over the factory function.
 *
 * Functionally identical — both delegate to the same internal
 * transformer.
 *
 * @example
 *   ```typescript
 *   const decoder = new MLLPDecoderStream({ maxMessageSize: 512_000 });
 *   socket.readable.pipeThrough(decoder);
 *   ```;
 */
export class MLLPDecoderStream extends TransformStream<
  Uint8Array,
  DecodedMessage
> {
  constructor(options?: DecoderOptions) {
    super(createDecoderTransformer(options));
  }
}

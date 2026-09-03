# @glion/mllp-codec

## 0.18.0

### Minor Changes

- 64d78d6: `@glion/mllp-transport` is renamed to `@glion/mllp-codec`; `frame` / `unframe` become its whole surface, and protocol failures now speak in messages, not frames.
  - **Package renamed:** `@glion/mllp-transport` → `@glion/mllp-codec`. The package is a pure encoder/decoder pair with no socket or runtime dependency; the new name says so. Update installs and imports; the npm history stays under the old name, and `@glion/mllp-transport` will be `npm deprecate`d at this release pointing here — its last published decoder predates the frame-gluing and trickle-scan fixes, so do not stay on it.
  - **`FramingError` → `MllpCodecError`** (and `FramingErrorCode` → `MllpCodecErrorCode`), with codes renamed for what the consumer experiences: `MISSING_START_BLOCK` → `UNEXPECTED_DATA`, `MISSING_END_BLOCK` → `INCOMPLETE_MESSAGE`, `FRAME_TOO_LARGE` → `MESSAGE_TOO_LARGE`, `EMBEDDED_CONTROL_CHAR` → `RESERVED_CHARACTER`. Every message text was rewritten in the same vocabulary — messages and reserved characters, not frames and blocks.

  - **`unframe(options?)`** — a `TransformStream<Uint8Array, Uint8Array>`: pipe the wire's byte stream through it and read complete MLLP payloads, one HL7v2 message per chunk, with partial and coalesced frames reassembled across reads. Framing violations error the stream with a typed `MllpCodecError`.
  - **Removed:** `createFrameDecoder`, `FrameDecoder`, `FrameDecoderOptions`, `FrameDecoderStream`, `decode`, and `validate`. The push-based engine lives on internally behind `unframe`; `frame` runs the reserved-byte check itself (`validate` folded in, so string payloads are encoded once instead of twice); one-shot `decode` had no consumer — `unframe` is the single inbound door. Migrate `socket.readable.pipeThrough(new FrameDecoderStream(opts))` → `socket.readable.pipeThrough(unframe(opts))`; `FrameDecoderOptions` → `UnframeOptions`; `validate(payload)` → `frame(payload)` (same check, discard the result).
  - **`frame()` takes bytes only.** The `string` overload is removed: the codec is content-opaque — it cannot read the message's MSH-18 character-set declaration, so it must not choose a wire encoding either (the old overload silently UTF-8-encoded, bypassing the charset layer and able to contradict a declared MSH-18). Encode where the declaration is visible and pass bytes: `frame(text)` → `frame(encodeBytes(text))` (`encodeBytes` from `@glion/util-charset`). Charset transparency — including the structural impossibility of carrying UTF-16 over MLLP — is now pinned by a dedicated test suite.
  - **Frames can never glue.** An MLLP start marker (VT, `0x0B`) appearing inside an unterminated frame now errors the stream with `RESERVED_CHARACTER`, eagerly — the moment the second VT is seen. A sender that stalls mid-frame and then starts its next message can no longer have two messages fused into one payload — the rule `frame` already enforces outbound. An embedded lone FS (not followed by CR) remains payload content, matching Mirth Connect and HAPI.
  - **Trickle-proof scanning.** The streaming decoder was rewritten as a single-cursor scan: bytes are classified left-to-right exactly once, the next FS decides what follows, and an FS at the buffer's end simply waits for its successor (that one rule replaces split-terminator arithmetic). A sender trickling a large frame in small chunks previously cost O(buffered) per chunk — a CPU soft spot alongside the existing `maxBufferedBytes` memory bound — and the FS search also walked stale buffer capacity past the live bytes. Measured on a 64 KiB frame in 64 B chunks: ~44.6 → ~1,040 ops/s (22.4 ms → ~1.0 ms per frame, ~23×); the residual is Web Streams per-chunk overhead, and the old gap widened quadratically with frame size. Guarded by trickle benchmarks in the package (`pnpm --filter @glion/mllp-codec bench`) and in the CodSpeed suite.
  - `@glion/mllp`'s Node server now reads through `unframe()`. A glued inbound message tears that connection down with a protocol error instead of being absorbed as one corrupted payload.
  - **The server is never silent about a byte-stream violation.** `@glion/mllp` translates an inbound framing violation — or a handler response carrying a reserved VT/FS byte that cannot be framed — into `MllpServerError` `PROTOCOL_VIOLATION` (codec error on `cause`) and routes it to `onError` before closing the connection, instead of swallowing it as transport noise.

> Versions up to and including 0.17.0 were published as `@glion/mllp-transport`; the package was renamed to `@glion/mllp-codec` in the following release.

## 0.17.0

### Minor Changes

- 58de708: Byte-level MLLP framing API for HL7v2: `frame`, `decode`, `validate`, `createFrameDecoder`, and the `FrameDecoderStream` Web Streams wrapper, plus the `VT`/`FS`/`CR` constants and a typed `FramingError` discriminated by `FramingErrorCode`. Replaces the previous `encode` / `createDecoderStream` / `MllpError` surface.

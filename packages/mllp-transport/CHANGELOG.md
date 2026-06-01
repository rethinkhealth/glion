# @glion/mllp-transport

## 0.17.0

### Minor Changes

- 58de708: Byte-level MLLP framing API for HL7v2: `frame`, `decode`, `validate`, `createFrameDecoder`, and the `FrameDecoderStream` Web Streams wrapper, plus the `VT`/`FS`/`CR` constants and a typed `FramingError` discriminated by `FramingErrorCode`. Replaces the previous `encode` / `createDecoderStream` / `MllpError` surface.

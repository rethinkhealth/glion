// biome-ignore-all lint/performance/noBarrelFile: package barrel

// -------------
// Errors
// -------------
export { MllpError, TransportError } from "./errors";
export type { MllpErrorOptions } from "./errors";

// -------------
// Framing constants
// -------------
export {
  MLLP_END_BYTE_1,
  MLLP_END_BYTE_2,
  MLLP_HEADER,
  MLLP_START_BYTE,
  MLLP_TRAILER,
} from "./constants";

// -------------
// Encoder / Decoder
// -------------
export { decode } from "./decoder";
export { createDecoderStream, MLLPDecoderStream } from "./decoder-stream";
export { encode, encodeMultiple } from "./encoder";

// -------------
// Types
// -------------
export { TransportErrorCode as ErrorCode } from "./types";
export type {
  DecodedMessage,
  DecoderOptions,
  EncoderInput,
  EncoderOptions,
} from "./types";

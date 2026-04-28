// biome-ignore-all lint/performance/noBarrelFile: fine

// -------------
// Transport (framing, encoding, decoding) — re-exported from
// `@glion/mllp-transport` for backwards compatibility. Prefer
// importing from `@glion/mllp-transport` directly in new code.
// -------------
export {
  createDecoderStream,
  decode,
  encode,
  encodeMultiple,
  TransportError,
  ErrorCode,
  MLLP_END_BYTE_1,
  MLLP_END_BYTE_2,
  MLLP_HEADER,
  MLLP_START_BYTE,
  MLLP_TRAILER,
  MLLPDecoderStream,
  MllpError,
} from "@glion/mllp-transport";
export type {
  DecodedMessage,
  DecoderOptions,
  EncoderInput,
  EncoderOptions,
  MllpErrorOptions,
} from "@glion/mllp-transport";

// -------------
// Server
// -------------
export { getMessageInfo, Mllp } from "./server/mllp";
export type { MessageInfo } from "./server/mllp";
export type {
  ConnectionInfo,
  Context,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  MiddlewareReturn,
  Response,
  RouteFilter,
  RoutePattern,
} from "./server/types";
export { matchPattern, parsePattern } from "./server/types";

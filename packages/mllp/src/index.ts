// biome-ignore-all lint/performance/noBarrelFile: fine

// Transport framing/encoding/decoding now lives in `@glion/mllp-transport`
// (new API: `frame` / `decode` / `FrameDecoderStream` / `FramingError`).
// Import it directly; `@glion/mllp` no longer re-exports the transport surface.

// -------------
// Server
// -------------
export { MllpServerError, MllpServerErrorCode } from "./errors";
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

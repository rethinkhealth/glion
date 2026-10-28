// biome-ignore-all lint/performance/noBarrelFile: fine

// Transport framing now lives in `@glion/mllp-codec`
// (new API: `frame` / `unframe` / `MllpCodecError`).
// Import it directly; `@glion/mllp` no longer re-exports the transport surface.

// -------------
// Server
// -------------
export { MllpServerError, MllpServerErrorCode } from "./errors";
export { acknowledge } from "./server/acknowledge";
export type { AcknowledgeOptions } from "./server/acknowledge";
export { handleConnection } from "./server/connection";
export type { HandleConnectionOptions, MllpSocket } from "./server/connection";
export { Mllp } from "./server/mllp";
export type { MessageHeader, MllpRequest } from "./server/request";
export type { MllpResponse } from "./server/response";
export type {
  AckOptions,
  Context,
  EnvArgs,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  MiddlewareReturn,
  MllpOptions,
  RouteFilter,
  RoutePattern,
} from "./server/types";
export { matchPattern, parsePattern } from "./server/types";

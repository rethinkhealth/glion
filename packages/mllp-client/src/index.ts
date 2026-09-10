/**
 * `@glion/mllp-client` — persistent MLLP client for HL7v2.
 *
 * One socket to one remote system, one message on the wire at a time.
 * `send()` takes a parsed `Root`, writes it, and resolves with the
 * acknowledgment that answers it. A NAK (`AE`, `AR`, `CE`, `CR`) rejects with
 * the matching `@glion/ack` exception — the same type the server raises.
 *
 * Runtime adapters implement {@link MllpSocket}; the Node adapter is in
 * `@glion/mllp-client/node`.
 *
 * @module
 */

export { MllpClient } from "./client/index";
export type { MllpConnection } from "./client/connection";
export { MllpClientEmitter } from "./client/events";
export type {
  MllpClientEvent,
  MllpClientEvents,
  MllpClientListener,
} from "./client/events";
export type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpSendOptions,
  MllpSocket,
  MllpStreams,
} from "./types";
export {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpClientError,
  MllpConnectFailedError,
  MllpConnectTimeoutError,
  MllpConnectionLostError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpInvalidResponseError,
  MllpSendTimeoutError,
} from "./errors";

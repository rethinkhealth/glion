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

export { MllpClient } from "./client";
export { MllpClientEmitter } from "./events";
export type {
  MllpClientEvent,
  MllpClientEvents,
  MllpClientListener,
} from "./events";
export type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpReconnectOptions,
  MllpSendOptions,
  MllpSocket,
  MllpStreams,
} from "./types";
export {
  MllpClientClosedError,
  MllpClientError,
  MllpConnectionError,
  MllpConnectionFailedError,
  MllpConnectionLostError,
  MllpConnectionTimeoutError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpInvalidResponseError,
  MllpSendAbortedError,
  MllpSendTimeoutError,
} from "./errors";
export type { MllpDelivery } from "./errors";

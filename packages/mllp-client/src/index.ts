/**
 * `@glion/mllp-client` — persistent MLLP client for HL7v2.
 *
 * One connection, one send on the wire at a time. `send()` accepts a `string`
 * or a `Root`: every input is parsed to a tree and re-serialized to canonical
 * HL7v2 for the wire (an _originating / cleaning_ client, not a byte-exact
 * relay), and the same tree reads MSH-10 for correlation. A NAK (AE/AR/CE/CR)
 * rejects with the central `@glion/ack` exception family
 * (`AckApplicationError`, `AckApplicationReject`, `AckCommitError`,
 * `AckCommitReject`) — the same types the server throws; import them and
 * `AckException` from `@glion/ack`. Runtime adapters live behind
 * {@link MllpConnector} — the default Node adapter is in
 * `@glion/mllp-client/node`.
 *
 * @module
 */

export { MllpClient } from "./client";
export type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpConnector,
  MllpSendOptions,
  MllpConnection,
  SendInput,
} from "./types";
export {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpClientError,
  MllpConnectAbortedError,
  MllpConnectFailedError,
  MllpConnectTimeoutError,
  MllpDroppedError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpInvalidResponseError,
  MllpSendTimeoutError,
} from "./errors";
export type { MllpDelivery } from "./errors";

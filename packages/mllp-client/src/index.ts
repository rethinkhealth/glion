/**
 * `@glion/mllp-client` — persistent MLLP client for HL7v2.
 *
 * One connection, one send on the wire at a time. `send()` accepts a
 * `string` / `Uint8Array` / `Root`: the caller's bytes (or a serialized
 * `Root`) go on the wire unchanged, while the tree is used to read MSH-10 for
 * correlation and to parse the ACK. A NAK (AE/AR/CE/CR) throws the central
 * `@glion/ack` exception family (`AckApplicationError`, `AckApplicationReject`,
 * `AckCommitError`, `AckCommitReject`) — the same types the server throws;
 * import them and `AckException` from `@glion/ack`. Runtime adapters live
 * behind {@link MllpConnector} — the default Node adapter is in
 * `@glion/mllp-client/node`.
 *
 * @module
 */

export { MllpClient } from "./client";
export type {
  MllpClientOptions,
  MllpClientState,
  MllpSendOptions,
} from "./client";
export type { MllpConnector, MllpDuplex } from "./duplex";
export {
  MllpClientError,
  MllpConnectError,
  MllpCorrelationError,
  MllpDroppedError,
  MllpErrorCode,
  MllpTimeoutError,
} from "./errors";
export type { MllpDropReason } from "./errors";
export type { MllpClientResponse, SendInput } from "./hl7v2";

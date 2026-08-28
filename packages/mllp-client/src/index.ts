/**
 * `@glion/mllp-client` — persistent MLLP client for HL7v2.
 *
 * One connection, one send on the wire at a time. `send()` accepts a `string`
 * or a `Root`: every input is parsed to a tree and re-serialized to canonical
 * HL7v2 for the wire (an *originating / cleaning* client, not a byte-exact
 * relay), and the same tree reads MSH-10 for correlation. A NAK (AE/AR/CE/CR)
 * throws the central `@glion/ack` exception family (`AckApplicationError`,
 * `AckApplicationReject`, `AckCommitError`, `AckCommitReject`) — the same types
 * the server throws; import them and `AckException` from `@glion/ack`. Runtime
 * adapters live behind {@link MllpConnector} — the default Node adapter is in
 * `@glion/mllp-client/node`.
 *
 * @module
 */

export { MllpClient } from "./client";
export type {
  MllpClientOptions,
  MllpClientState,
  MllpConnector,
  MllpDuplex,
  MllpSendOptions,
  SendInput,
} from "./client";
export type { MllpClientResponse } from "./client";
export { MllpClientError, MllpErrorCode } from "./errors";

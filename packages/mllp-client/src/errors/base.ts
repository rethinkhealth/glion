/**
 * The base every client error extends, and what each one carries: a fixed
 * `code`, a fixed message, what became of the message, and the lower layer's
 * failure on `cause`.
 *
 * @module
 */

export const MllpErrorCode = {
  ALREADY_SENDING: "ALREADY_SENDING",
  CLOSED: "CLOSED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CONNECTION_LOST: "CONNECTION_LOST",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_OPTION: "INVALID_OPTION",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SEND_ABORTED: "SEND_ABORTED",
  SEND_TIMEOUT: "SEND_TIMEOUT",
} as const;

export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

/**
 * What became of the message. `not-sent`: nothing reached the wire, and the
 * message may be sent again as it is. `unknown`: it may have reached the
 * remote system, and sending it again may deliver it twice.
 */
export type MllpDelivery = "not-sent" | "unknown";

export abstract class MllpClientError extends Error {
  abstract readonly code: MllpErrorCode;
  abstract readonly delivery: MllpDelivery;
}

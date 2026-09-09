/**
 * The base every client error extends, and the two values each one carries.
 *
 * @module
 */

export const MllpErrorCode = {
  ALREADY_SENDING: "ALREADY_SENDING",
  CLOSED: "CLOSED",
  CONNECT_FAILED: "CONNECT_FAILED",
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  DROPPED: "DROPPED",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_OPTION: "INVALID_OPTION",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SEND_TIMEOUT: "SEND_TIMEOUT",
} as const;

export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

/**
 * Whether a message may have reached the remote system.
 *
 * - `not-sent`: nothing reached the wire. Sending again is safe.
 * - `unknown`: the message may have been received. Send again only when the
 *   message is safe to repeat.
 */
export type MllpDelivery = "not-sent" | "unknown";

export abstract class MllpClientError extends Error {
  abstract readonly code: MllpErrorCode;
  /** Whether the message may have reached the remote system. */
  abstract readonly delivery: MllpDelivery;
}

/** The text of a lower layer's error, for the message that wraps it. */
export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
